const uniqueFilterIds = (ids = []) =>
	Array.from(new Map(ids.filter((id) => id !== null && id !== undefined && id !== "").map((id) => [String(id), id])).values());

export const buildEffectiveCalendarFilters = ({ groups = [], rooms = [], teachers = [] } = {}, context = { type: "group", ids: [] }) => {
	const globalFilters = {
		groups: uniqueFilterIds(groups),
		rooms: uniqueFilterIds(rooms),
		teachers: uniqueFilterIds(teachers),
	};

	if (!context || context.type === "group") return globalFilters;

	const contextIds = uniqueFilterIds(context.ids || []);
	return {
		groups: context.type === "single-group" ? contextIds : [],
		rooms: context.type === "room" ? contextIds : [],
		teachers: context.type === "teacher" ? contextIds : [],
	};
};

const appendFilterIds = (params, key, ids = []) => {
	ids.filter((id) => id !== null && id !== undefined && id !== "").forEach((id) => params.append(key, String(id)));
};

export const buildCalendarFilterParams = ({ groups = [], rooms = [], teachers = [] } = {}) => {
	const params = new URLSearchParams();
	appendFilterIds(params, "groups", groups);
	appendFilterIds(params, "rooms", rooms);
	appendFilterIds(params, "teachers", teachers);
	return params;
};

const normalizeSearchValue = (value) =>
	String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase("fr-FR")
		.trim();

// The lists are searched on every keystroke: each label is normalized once, not 2 000 times per key.
const normalizedLabels = new WeakMap();

export const filterCalendarFilterOptions = (options = [], search = "", getLabel = (option) => option?.name || "") => {
	const searchTerms = normalizeSearchValue(search).split(/\s+/).filter(Boolean);
	if (searchTerms.length === 0) return options;

	return options.filter((option) => {
		let normalizedLabel = normalizedLabels.get(option);
		if (normalizedLabel === undefined) {
			normalizedLabel = normalizeSearchValue(getLabel(option));
			normalizedLabels.set(option, normalizedLabel);
		}
		return searchTerms.every((term) => normalizedLabel.includes(term));
	});
};
