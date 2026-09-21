import type { CalendarQuery } from "../services/api";
import type { ScheduleContext } from "../components/calendar/calendarModel";

export type ScheduleFilters = Required<CalendarQuery>;

const uniqueIds = (ids: Array<string | number>) => Array.from(new Map(ids.map((id) => [String(id), id])).values());

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
