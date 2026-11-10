import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

const Modal = ({ title, titleAside, onClose, footer, className = "", style, icon, hue, children }) => {
	const titleId = useId();
	const sheetRef = useRef(null);
	const closeRef = useRef(onClose);
	closeRef.current = onClose;

	useEffect(() => {
		const previous = document.activeElement;
		sheetRef.current?.focus();
		const onKey = (event) => {
			if (event.key === "Escape") closeRef.current();
		};
		document.addEventListener("keydown", onKey);
		document.body.classList.add("has-modal");
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.classList.remove("has-modal");
			previous?.focus?.();
		};
	}, []);

	return (
		<div
			className="modal-overlay"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}>
			<div
				ref={sheetRef}
				className={`modal-sheet sheet ${hue !== undefined ? "tool-sheet" : ""} ${className}`}
				style={hue !== undefined ? { ...style, "--ic": hue } : style}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}>
				<span className="tape modal-tape" aria-hidden="true" />
				<header className="modal-head">
					<div className="modal-title">
						<h2 id={titleId}>
							{icon && (
								<span className="modal-icon" aria-hidden="true">
									{icon}
								</span>
							)}
							{title}
						</h2>
						{titleAside}
					</div>
					<button type="button" className="tool" onClick={onClose} aria-label="Fermer">
						<X size={18} strokeWidth={2.2} aria-hidden="true" />
					</button>
				</header>
				<div className="modal-body">{children}</div>
				{footer && <footer className="modal-foot">{footer}</footer>}
			</div>
		</div>
	);
};

export default Modal;
