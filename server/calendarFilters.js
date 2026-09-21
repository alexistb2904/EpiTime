const normalizeFilterIds = (values = []) => {
	const items = Array.isArray(values) ? values : String(values).split(",");
	return Array.from(
		new Set(
			items
				.map((value) => String(value ?? "").trim())
				.filter(Boolean),
		),
	);
};

const getRelationIds = (event, key, nestedKey) =>
	(event?.[key] || [])
		.map((item) => item?.id ?? item?.[nestedKey]?.id)
		.map((value) => String(value ?? "").trim())
		.filter(Boolean);

const matchesAny = (selectedIds, eventIds) => {
	if (selectedIds.length === 0) return true;
	const eventIdSet = new Set(eventIds);
	return selectedIds.some((id) => eventIdSet.has(id));
};

export const normalizeCalendarFilters = ({ groups = [], rooms = [], teachers = [] } = {}) => ({
	groups: normalizeFilterIds(groups),
	rooms: normalizeFilterIds(rooms),
	teachers: normalizeFilterIds(teachers),
});

export const eventMatchesCalendarFilters = (event, filters = {}) => {
	const normalized = normalizeCalendarFilters(filters);

	return (
		matchesAny(normalized.groups, getRelationIds(event, "groups", "group")) &&
		matchesAny(normalized.rooms, getRelationIds(event, "rooms", "room")) &&
		matchesAny(normalized.teachers, getRelationIds(event, "teachers", "teacher"))
	);
};

export const filterEventsByCalendarFilters = (events = [], filters = {}) => {
	if (!Array.isArray(events)) return [];
	const normalized = normalizeCalendarFilters(filters);
	if (!normalized.groups.length && !normalized.rooms.length && !normalized.teachers.length) return events;
	return events.filter((event) => eventMatchesCalendarFilters(event, normalized));
};
