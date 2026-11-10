import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Users } from "lucide-react";
import Modal from "./Modal";

const getExpandableIdsFromTree = (nodes) => {
	const ids = [];
	const walk = (nodeList) => {
		nodeList.forEach((node) => {
			if (node.children && node.children.length > 0) {
				ids.push(node.id);
				walk(node.children);
			}
		});
	};
	walk(nodes || []);
	return ids;
};

const GroupTreeItem = ({ group, selectedGroups, onToggle, expandedNodes, onToggleExpand, forceExpanded }) => {
	const isSelected = selectedGroups.includes(group.id);
	const hasChildren = group.children && group.children.length > 0;
	const isExpanded = forceExpanded ? true : !!expandedNodes[group.id];

	return (
		<li className="tree-node">
			<div className={`tree-row ${isSelected ? "is-selected" : ""}`}>
				{hasChildren ? (
					<button
						type="button"
						className={`tree-toggle ${isExpanded ? "is-open" : ""}`}
						onClick={() => onToggleExpand(group.id)}
						aria-expanded={isExpanded}
						aria-label={isExpanded ? `Replier ${group.name}` : `Déplier ${group.name}`}>
						<ChevronRight size={16} strokeWidth={2.4} aria-hidden="true" />
					</button>
				) : (
					<span className="tree-toggle" aria-hidden="true" />
				)}
				<label>
					<input type="checkbox" checked={isSelected} onChange={() => onToggle(group.id)} />
					{group.color && <span className="swatch" style={{ background: group.color }} aria-hidden="true" />}
					<span>{group.name}</span>
				</label>
			</div>

			{hasChildren && isExpanded && (
				<ul className="tree">
					{group.children.map((child) => (
						<GroupTreeItem
							key={child.id}
							group={child}
							selectedGroups={selectedGroups}
							onToggle={onToggle}
							expandedNodes={expandedNodes}
							onToggleExpand={onToggleExpand}
							forceExpanded={forceExpanded}
						/>
					))}
				</ul>
			)}
		</li>
	);
};

const GroupSelectionModal = ({ onClose, filteredGroupTree, selectedGroups, onToggle, groupSearch, setGroupSearch, onValidate }) => {
	const [expandedNodes, setExpandedNodes] = useState({});
	const isSearching = useMemo(() => groupSearch.trim().length > 0, [groupSearch]);

	useEffect(() => {
		if (!isSearching) {
			setExpandedNodes({});
			return;
		}

		const idsToExpand = getExpandableIdsFromTree(filteredGroupTree);
		setExpandedNodes((prev) => {
			const next = { ...prev };
			idsToExpand.forEach((id) => {
				next[id] = true;
			});
			return next;
		});
	}, [filteredGroupTree, isSearching]);

	const handleToggleExpand = (groupId) => {
		if (isSearching) return;
		setExpandedNodes((prev) => ({
			...prev,
			[groupId]: !prev[groupId],
		}));
	};

	return (
		<Modal
			className="groups-sheet"
			hue={265}
			icon={<Users size={18} strokeWidth={2.2} />}
			title="Mes groupes"
			onClose={onClose}
			footer={
				<>
					<span className="modal-foot-note">
						{selectedGroups.length === 0
							? "Aucun groupe coché"
							: `${selectedGroups.length} groupe${selectedGroups.length > 1 ? "s" : ""} coché${selectedGroups.length > 1 ? "s" : ""}`}
					</span>
					<button type="button" className="ticket is-ink is-compact" onClick={onValidate}>
						<span className="ticket-stub">
							<Check size={18} strokeWidth={2.4} aria-hidden="true" />
						</span>
						<span className="ticket-text">
							<strong>Afficher mon planning</strong>
						</span>
					</button>
				</>
			}>
			<input
				className="input"
				type="search"
				placeholder="Rechercher un groupe (ex. ING1, SCIA…)"
				value={groupSearch}
				onChange={(e) => setGroupSearch(e.target.value)}
				aria-label="Rechercher un groupe"
			/>
			{filteredGroupTree.length > 0 ? (
				<ul className="tree tree-root">
					{filteredGroupTree.map((root) => (
						<GroupTreeItem
							key={root.id}
							group={root}
							selectedGroups={selectedGroups}
							onToggle={onToggle}
							expandedNodes={expandedNodes}
							onToggleExpand={handleToggleExpand}
							forceExpanded={isSearching}
						/>
					))}
				</ul>
			) : (
				<p className="modal-hint">{isSearching ? `Aucun groupe ne correspond à « ${groupSearch.trim()} ».` : "Chargement des groupes…"}</p>
			)}
		</Modal>
	);
};

export default GroupSelectionModal;
