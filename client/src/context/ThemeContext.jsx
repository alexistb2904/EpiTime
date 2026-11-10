import React, { createContext, useContext, useState, useEffect } from "react";
import { flushSync } from "react-dom";

const ThemeContext = createContext();

const getInitialTheme = () => {
	const stored = localStorage.getItem("zeus_theme");
	return stored || "dark";
};

export const ThemeProvider = ({ children }) => {
	const [theme, setTheme] = useState(getInitialTheme);

	useEffect(() => {
		document.documentElement.setAttribute("data-theme", theme);
		localStorage.setItem("zeus_theme", theme);
	}, [theme]);

	const toggleTheme = () => {
		const next = theme === "light" ? "dark" : "light";
		const apply = () => {
			document.documentElement.setAttribute("data-theme", next);
			flushSync(() => setTheme(next));
		};
		const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		if (!document.startViewTransition || reduceMotion) {
			setTheme(next);
			return;
		}
		document.startViewTransition(apply);
	};

	return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
