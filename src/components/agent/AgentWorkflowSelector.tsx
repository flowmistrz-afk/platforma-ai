import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import './AgentWorkflowSelector.css';
import { IconType } from 'react-icons';
import { FiCode, FiGrid, FiLink, FiSearch, FiGlobe, FiClipboard } from 'react-icons/fi';
import { IoPersonOutline } from 'react-icons/io5';

// --- DATA and TYPES ---
type DependencyType = 'AND' | 'OR';
const ALL_MODULES: {id: string, name: string, icon: IconType, dependsOn: string[], dependencyType?: DependencyType}[] = [
    { id: 'enriching', name: 'Wzbogacanie Zapytań', icon: FiSearch, dependsOn: [] },
    { id: 'ceidg-searching', name: 'Wyszukiwanie w CEIDG', icon: FiGlobe, dependsOn: ['enriching'] },
    { id: 'searching', name: 'Wyszukiwanie Google', icon: IoPersonOutline, dependsOn: ['enriching'] },
    { id: 'classifying', name: 'Klasyfikacja Linków', dependsOn: ['searching'], icon: FiLink },
    { id: 'scraping-firmowe', name: 'Scraping Stron Firmowych', icon: FiGrid, dependsOn: ['classifying'] },
    { id: 'scraping-portale', name: 'Scraping Portali', icon: FiClipboard, dependsOn: ['classifying'] },
    { id: 'aggregating', name: 'Agregacja Wyników', dependsOn: ['scraping-firmowe', 'scraping-portale', 'ceidg-searching'], dependencyType: 'OR', icon: FiCode },
];

const treeModules = ALL_MODULES.filter(m => m.dependencyType !== 'OR');
const joinNodes = ALL_MODULES.filter(m => m.dependencyType === 'OR');

// --- HELPER & CHILD COMPONENTS ---

const ToggleSwitch = ({ id, isToggled, handleToggle }: { id: string, isToggled: boolean, handleToggle: (id: string) => void }) => (
    <label className="switch">
        <input type="checkbox" checked={isToggled} onChange={() => handleToggle(id)} />
        <span className="slider round"></span>
    </label>
);

const IconWrapper = ({ icon: Icon }: { icon: IconType }) => {
    if (!Icon) return null;
    // @ts-ignore - Workaround for a complex typing issue
    return <Icon />;
};


type ModuleType = typeof ALL_MODULES[0];
interface TreeNodeProps {
    node: ModuleType;
    isVisible: (module: ModuleType) => boolean;
    selectedSteps: string[];
    handleToggle: (id: string) => void;
    setNodeRef: (id: string, el: HTMLDivElement | null) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, isVisible, selectedSteps, handleToggle, setNodeRef }) => {
    if (!isVisible(node)) {
        return null;
    }

    const children = treeModules.filter(m => m.dependsOn.includes(node.id));

    return (
        <div className="tree-node-wrapper">
            <div 
                className="tree-node"
                data-active={selectedSteps.includes(node.id)}
                ref={el => setNodeRef(node.id, el)}
            >
                <div className="node-icon"><IconWrapper icon={node.icon} /></div>
                <div className="node-label">{node.name}</div>
                <ToggleSwitch 
                    id={node.id} 
                    isToggled={selectedSteps.includes(node.id)} 
                    handleToggle={handleToggle} 
                />
            </div>

            {children.length > 0 && (
                <div className="tree-children-container">
                    {children.map(childNode => (
                        <TreeNode 
                            key={childNode.id}
                            node={childNode}
                            isVisible={isVisible}
                            selectedSteps={selectedSteps}
                            handleToggle={handleToggle}
                            setNodeRef={setNodeRef}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// --- MAIN COMPONENT ---

interface AgentWorkflowSelectorProps {
  selectedSteps: string[];
  onChange: (selected: string[]) => void;
}

const AgentWorkflowSelector: React.FC<AgentWorkflowSelectorProps> = ({ selectedSteps, onChange }) => {

    const [lines, setLines] = useState<any[]>([]);
    const nodeRefs = useRef(new Map());
    const containerRef = useRef<HTMLDivElement>(null);
    const brainRef = useRef<HTMLDivElement>(null);

    const setNodeRef = (id: string, el: HTMLDivElement | null) => {
        if (el) {
            nodeRefs.current.set(id, el);
        } else {
            nodeRefs.current.delete(id);
        }
    };

    const isVisible = useCallback((module: ModuleType) => {
        if (module.dependsOn.length === 0) return true;

        if (module.dependencyType === 'OR') {
            return module.dependsOn.some(dep => selectedSteps.includes(dep));
        }
        
        return module.dependsOn.every(dep => selectedSteps.includes(dep));
    }, [selectedSteps]);

    const isLeafInSelection = (nodeId: string, selected: string[]): boolean => {
        const children = treeModules.filter(m => m.dependsOn.includes(nodeId));
        return !children.some(c => selected.includes(c.id));
    };

    useLayoutEffect(() => {
        const newLines: any[] = [];
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return;

        const brainRect = brainRef.current?.getBoundingClientRect();
        const rootNodes = treeModules.filter(m => m.dependsOn.length === 0);

        // Draw lines from Brain to Root nodes
        if (brainRect) {
            rootNodes.forEach(rootNode => {
                const rootEl = nodeRefs.current.get(rootNode.id);
                if (rootEl) {
                    const rootRect = rootEl.getBoundingClientRect();
                    newLines.push({
                        id: `brain-${rootNode.id}`,
                        type: 'tree',
                        x1: brainRect.left + brainRect.width / 2 - containerRect.left,
                        y1: brainRect.bottom - containerRect.top,
                        x2: rootRect.left + rootRect.width / 2 - containerRect.left,
                        y2: rootRect.top - containerRect.top,
                    });
                }
            });
        }

        // Draw lines between nodes in the tree
        treeModules.forEach(node => {
            if (isVisible(node) && node.dependsOn.length > 0) {
                const childEl = nodeRefs.current.get(node.id);
                const parentId = node.dependsOn[0]; 
                const parentEl = nodeRefs.current.get(parentId);

                if (childEl && parentEl) {
                    const childRect = childEl.getBoundingClientRect();
                    const parentRect = parentEl.getBoundingClientRect();
                    newLines.push({
                        id: `${parentId}-${node.id}`,
                        type: 'tree',
                        x1: parentRect.left + parentRect.width / 2 - containerRect.left,
                        y1: parentRect.top + parentRect.height - containerRect.top,
                        x2: childRect.left + childRect.width / 2 - containerRect.left,
                        y2: childRect.top - containerRect.top,
                    });
                }
            }
        });

        // Draw lines from active parents to visible join nodes
        joinNodes.forEach(node => {
            if (isVisible(node)) {
                const childEl = nodeRefs.current.get(node.id);
                if (childEl) {
                    node.dependsOn.forEach(parentId => {
                        if (selectedSteps.includes(parentId) && isLeafInSelection(parentId, selectedSteps)) {
                            const parentEl = nodeRefs.current.get(parentId);
                            if (parentEl) {
                                const childRect = childEl.getBoundingClientRect();
                                const parentRect = parentEl.getBoundingClientRect();

                                const googlePathParents = ['searching', 'classifying', 'scraping-firmowe', 'scraping-portale'];
                                const lineType = googlePathParents.includes(parentId) ? 'join-google' : 'join';

                                let x2 = childRect.left + childRect.width / 2 - containerRect.left;
                                let y2 = childRect.top - containerRect.top;

                                if (node.id === 'aggregating') {
                                    x2 = childRect.right - containerRect.left;
                                    y2 = childRect.bottom - containerRect.top;
                                }

                                newLines.push({
                                    id: `${parentId}-${node.id}`,
                                    type: lineType,
                                    x1: parentRect.left + parentRect.width / 2 - containerRect.left,
                                    y1: parentRect.top + parentRect.height - containerRect.top,
                                    x2: x2,
                                    y2: y2,
                                });
                            }
                        }
                    });
                }
            }
        });
        
        // Draw feedback line from Aggregation to Brain
        const aggregatingNode = joinNodes.find(n => n.id === 'aggregating');
        if (aggregatingNode && isVisible(aggregatingNode)) {
            const aggEl = nodeRefs.current.get('aggregating');
            if (aggEl && brainRect) {
                const aggRect = aggEl.getBoundingClientRect();
                newLines.push({
                    id: 'agg-to-brain',
                    type: 'feedback',
                    x1: aggRect.right - containerRect.left,
                    y1: aggRect.top + aggRect.height / 2 - containerRect.top,
                    x2: brainRect.left - containerRect.left,
                    y2: brainRect.top + brainRect.height / 2 - containerRect.top,
                });
            }
        }

        setLines(newLines);
    }, [selectedSteps, isVisible]);

    const handleToggle = (stepId: string) => {
        let newSelected = [...selectedSteps];
        const isSelected = newSelected.includes(stepId);

        if (isSelected) {
            const toDeselect = [stepId];
            let changed = true;
            while(changed) {
                changed = false;
                for (const module of ALL_MODULES) {
                    if (!toDeselect.includes(module.id) && module.dependsOn?.some(dep => toDeselect.includes(dep))) {
                        toDeselect.push(module.id);
                        changed = true;
                    }
                }
            }
            newSelected = newSelected.filter(s => !toDeselect.includes(s));
        } else {
            const stepInfo = ALL_MODULES.find(s => s.id === stepId);
            if (stepInfo && isVisible(stepInfo)) {
                if (!newSelected.includes(stepId)) {
                    newSelected.push(stepId);
                }
            } else {
                const toSelect = [stepId];
                let changed = true;
                while(changed) {
                    changed = false;
                    for (const currentId of [...toSelect]) { // Iterate over a copy
                        const currentStepInfo = ALL_MODULES.find(s => s.id === currentId);
                        if (currentStepInfo?.dependsOn) {
                            for (const depId of currentStepInfo.dependsOn) {
                                if (!toSelect.includes(depId)) {
                                    toSelect.push(depId);
                                    changed = true;
                                }
                            }
                        }
                    }
                }
                toSelect.forEach(id => {
                    if (!newSelected.includes(id)) {
                        newSelected.push(id);
                    }
                });
            }
        }

        joinNodes.forEach(jNode => {
            const isJoinNodeVisible = jNode.dependsOn.some(dep => newSelected.includes(dep));
            if (isJoinNodeVisible && !newSelected.includes(jNode.id)) {
                newSelected.push(jNode.id);
            }
        });
        
        const order = ALL_MODULES.map(m => m.id);
        newSelected.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        
        onChange(newSelected);
    };

    const rootNodes = treeModules.filter(m => m.dependsOn.length === 0);

    return (
        <div className="agent-container" ref={containerRef}>
            <div className="layout-top-row">
                <div className="join-nodes-container">
                    {joinNodes.map(node => {
                        if (!isVisible(node)) return null;
                        return (
                            <div 
                                key={node.id} 
                                className="tree-node join-node"
                                data-active={selectedSteps.includes(node.id)}
                                ref={el => setNodeRef(node.id, el)}
                            >
                                <div className="node-icon"><IconWrapper icon={node.icon} /></div>
                                <div className="node-label">{node.name}</div>
                                {/* TOGGLE SWITCH REMOVED */}
                            </div>
                        );
                    })}
                </div>
                <div className="brain-node" ref={brainRef}>MÓZG AGENTA</div>
            </div>
            
            <svg className="connector-svg">
                {lines.map(line => (
                    <line 
                        key={line.id} 
                        className={line.type}
                        x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} 
                    />
                ))}
            </svg>

            <div className="tree-root-container">
                {rootNodes.map(node => (
                    <TreeNode 
                        key={node.id}
                        node={node}
                        isVisible={isVisible}
                        selectedSteps={selectedSteps}
                        handleToggle={handleToggle}
                        setNodeRef={setNodeRef}
                    />
                ))}
            </div>
        </div>
    );
};

export default AgentWorkflowSelector;