import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

const getInitialTheme = () => {
	const stored = localStorage.getItem('zeus_theme');
	if (stored) return stored;

	if (typeof window !== 'undefined' && window.matchMedia) {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}

	return 'light';
};

export const ThemeProvider = ({ children }) => {
	const [theme, setTheme] = useState(getInitialTheme);

	useEffect(() => {
		document.documentElement.setAttribute('data-theme', theme);
		localStorage.setItem('zeus_theme', theme);
	}, [theme]);

	const toggleTheme = () => {
		setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
	};

	return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
