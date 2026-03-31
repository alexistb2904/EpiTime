import React, { useEffect, useMemo, useState } from 'react';

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

const GroupTreeItem = ({ group, selectedGroups, onToggle, depth = 0, expandedNodes, onToggleExpand, forceExpanded }) => {
	const isSelected = selectedGroups.includes(group.id);
	const hasChildren = group.children && group.children.length > 0;
	const isExpanded = forceExpanded ? true : !!expandedNodes[group.id];

	return (
		<div className="group-tree-node" style={{ marginLeft: `${depth * 20}px` }}>
			<div className={`group-checkbox-row ${isSelected ? 'selected' : ''}`} style={{ '--group-color': group.color || '#ccc' }}>
				{hasChildren ? (
					<button
						type="button"
						className={`group-expand-toggle ${isExpanded ? 'expanded' : ''}`}
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onToggleExpand(group.id);
						}}
						aria-label={isExpanded ? `Rétracter ${group.name}` : `Étendre ${group.name}`}>
						▸
					</button>
				) : (
					<span className="group-expand-spacer" />
				)}

				<label className="group-checkbox-label">
					<input type="checkbox" checked={isSelected} onChange={() => onToggle(group.id)} />
					<span className="checkmark"></span>
					<span className="group-name">{group.name}</span>
					{group.color && <span className="color-dot" style={{ background: group.color }}></span>}
				</label>
			</div>

			{hasChildren && isExpanded && (
				<div className="group-children">
					{group.children.map((child) => (
						<GroupTreeItem
							key={child.id}
							group={child}
							selectedGroups={selectedGroups}
							onToggle={onToggle}
							depth={depth + 1}
							expandedNodes={expandedNodes}
							onToggleExpand={onToggleExpand}
							forceExpanded={forceExpanded}
						/>
					))}
				</div>
			)}
		</div>
	);
};

const GroupSelectionModal = ({ show, onClose, filteredGroupTree, selectedGroups, onToggle, groupSearch, setGroupSearch, onValidate }) => {
	const [expandedNodes, setExpandedNodes] = useState({});
	const isSearching = useMemo(() => groupSearch.trim().length > 0, [groupSearch]);

	useEffect(() => {
		if (!show) return;

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
	}, [filteredGroupTree, isSearching, show]);

	const handleToggleExpand = (groupId) => {
		if (isSearching) return;
		setExpandedNodes((prev) => ({
			...prev,
			[groupId]: !prev[groupId],
		}));
	};

	if (!show) return null;

	return (
		<div
			className="modal-overlay"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}>
			<div className="modal-content" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2>Choisir mes groupes</h2>
					<button
						className="btn-icon"
						onClick={(e) => {
							e.stopPropagation();
							onClose();
						}}>
						✕
					</button>
				</div>
				<div style={{ padding: '0 2%' }}>
					<input
						style={{ marginBottom: '0' }}
						className="search-input"
						placeholder="Rechercher un groupe..."
						value={groupSearch}
						onChange={(e) => setGroupSearch(e.target.value)}
					/>
				</div>
				<div className="modal-body group-tree-container">
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
				</div>
				<div className="modal-footer">
					<button className="btn-primary" onClick={onValidate}>
						Valider ({selectedGroups.length})
					</button>
				</div>
			</div>
		</div>
	);
};

export default GroupSelectionModal;
