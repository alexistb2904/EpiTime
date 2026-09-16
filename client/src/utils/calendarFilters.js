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

export const filterCalendarFilterOptions = (options = [], search = "", getLabel = (option) => option?.name || "") => {
	const searchTerms = normalizeSearchValue(search).split(/\s+/).filter(Boolean);
	if (searchTerms.length === 0) return options;

	return options.filter((option) => {
		const normalizedLabel = normalizeSearchValue(getLabel(option));
		return searchTerms.every((term) => normalizedLabel.includes(term));
	});
};
