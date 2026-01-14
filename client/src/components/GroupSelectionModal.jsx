import React from 'react';

const GroupTreeItem = ({ group, selectedGroups, onToggle, depth = 0 }) => {
	const isSelected = selectedGroups.includes(group.id);

	return (
		<div className="group-tree-node" style={{ marginLeft: `${depth * 20}px` }}>
			<label className={`group-checkbox-row ${isSelected ? 'selected' : ''}`} style={{ '--group-color': group.color || '#ccc' }}>
				<input type="checkbox" checked={isSelected} onChange={() => onToggle(group.id)} />
				<span className="checkmark"></span>
				<span className="group-name">{group.name}</span>
				{group.color && <span className="color-dot" style={{ background: group.color }}></span>}
			</label>
			{group.children && group.children.length > 0 && (
				<div className="group-children">
					{group.children.map((child) => (
						<GroupTreeItem key={child.id} group={child} selectedGroups={selectedGroups} onToggle={onToggle} depth={depth + 1} />
					))}
				</div>
			)}
		</div>
	);
};

const GroupSelectionModal = ({ show, onClose, filteredGroupTree, selectedGroups, onToggle, groupSearch, setGroupSearch, onValidate }) => {
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
				<div>
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
						<GroupTreeItem key={root.id} group={root} selectedGroups={selectedGroups} onToggle={onToggle} />
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
