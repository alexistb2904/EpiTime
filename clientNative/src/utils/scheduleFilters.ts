import type { CalendarQuery } from "../services/api";
import type { ScheduleContext } from "../components/calendar/calendarModel";

export type ScheduleFilters = Required<CalendarQuery>;

const uniqueIds = (ids: Array<string | number>) => Array.from(new Map(ids.map((id) => [String(id), id])).values());

export function hasScheduleFilters(filters: ScheduleFilters) {
	return filters.groups.length > 0 || filters.rooms.length > 0 || filters.teachers.length > 0;
}

export function buildScheduleFilterQuery(filters: ScheduleFilters, context: ScheduleContext): ScheduleFilters {
	return {
		groups: context.type === "single-group" ? uniqueIds(context.ids) : uniqueIds(filters.groups),
		rooms: uniqueIds([...(context.type === "room" ? context.ids : []), ...filters.rooms]),
		teachers: uniqueIds([...(context.type === "teacher" ? context.ids : []), ...filters.teachers]),
	};
}
