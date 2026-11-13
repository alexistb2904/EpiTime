import type { CalendarQuery } from "../services/api";
import type { ScheduleContext } from "../components/calendar/calendarModel";

export type ScheduleFilters = Required<CalendarQuery>;

const uniqueIds = (ids: Array<string | number>) => Array.from(new Map(ids.map((id) => [String(id), id])).values());

/** Lowercase without accents: one plain key per label, used for both sorting and searching. */
export const normalizeSearchText = (value: string) =>
	value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();

/** Sorts on a key computed once per item. localeCompare on every comparison is far too slow on Hermes. */
export const sortByLabel = <T>(items: T[], getLabel: (item: T) => string) =>
	items
		.map((item) => ({ item, key: normalizeSearchText(getLabel(item)) }))
		.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
		.map(({ item }) => item);

/** First `limit` items whose key (see normalizeSearchText, same order as `items`) contains every search term. */
export function searchByKey<T>(items: T[], keys: string[], search: string, limit = 60) {
	const terms = normalizeSearchText(search).split(/\s+/).filter(Boolean);
	const matches: T[] = [];
	for (let index = 0; index < items.length && matches.length < limit; index++) {
		if (terms.every((term) => keys[index].includes(term))) matches.push(items[index]);
	}
	return matches;
}

export function hasScheduleFilters(filters: ScheduleFilters) {
	return filters.groups.length > 0 || filters.rooms.length > 0 || filters.teachers.length > 0;
}

export function buildScheduleFilterQuery(filters: ScheduleFilters, context: ScheduleContext): ScheduleFilters {
	if (context.type === "group") {
		return {
			groups: uniqueIds(filters.groups),
			rooms: uniqueIds(filters.rooms),
			teachers: uniqueIds(filters.teachers),
		};
	}

	const contextIds = uniqueIds(context.ids);
	return {
		groups: context.type === "single-group" ? contextIds : [],
		rooms: context.type === "room" ? contextIds : [],
		teachers: context.type === "teacher" ? contextIds : [],
	};
}
