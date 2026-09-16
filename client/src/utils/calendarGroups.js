export const getDisplayedGroupNames = (eventGroups = [], scheduleContext = {}) => {
	if (scheduleContext.type !== "group" || scheduleContext.ids?.length <= 1) return [];

	const eventGroupsById = new Map(eventGroups.map((group) => [group.id, group]));
	return scheduleContext.ids.map((id) => eventGroupsById.get(id)?.name).filter(Boolean);
};
