import React, { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  useReactFlow,
  Node as ReactFlowNode,
  Edge as ReactFlowEdge,
  Connection as ReactFlowConnection,
} from 'reactflow';
import Select from 'react-select';
import 'reactflow/dist/style.css';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';

import Sidebar from './Sidebar';
import ContextMenu from './ContextMenu';
import StartNode from './StartNode';
import AgentNode from './AgentNode';
import './WorkflowBuilder.css';
import { useWorkflowStore, StartNodeData } from '../../stores/workflowStore';
import pkdData from '../../data/pkd-database.json';

interface PkdOption {
  value: string;
  label: string;
}

const nodeTypes = { 
  startNode: StartNode,
  agentNode: AgentNode, 
};

let id = 1;
const getId = () => `${id++}`;

const DnDFlow = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [menu, setMenu] = useState<{ id: string; top: number; left: number; } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isStartNodeCreated, setIsStartNodeCreated] = useState(false);
  
  const { startNodeData, setStartNodeData } = useWorkflowStore();
  // Używamy poprawnej struktury danych z pkdCodes i pkdSection
  const [formData, setFormData] = useState<StartNodeData>(startNodeData || { query: '', city: '', province: '', pkdSection: '', pkdCodes: [], radius: 50 });

  const pkdSectionOptions = useMemo(() => pkdData.map(section => ({
    value: section.kod,
    label: `${section.kod} - ${section.nazwa}`
  })), []);

  const pkdSubclassOptions = useMemo(() => {
    if (!formData.pkdSection) return [];
    const section = pkdData.find(s => s.kod === formData.pkdSection);
    return section ? section.podklasy.map(sub => ({
      value: sub.kod,
      label: `${sub.kod} - ${sub.nazwa}`
    })) : [];
  }, [formData.pkdSection]);

  const reactFlowInstance = useReactFlow();

  useEffect(() => {
    if (startNodeData) setFormData(startNodeData);
  }, [startNodeData]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'radius' ? parseInt(value, 10) : value }));
  };

  const handlePkdSectionChange = (selectedOption: any) => {
    const section = selectedOption ? selectedOption.value : '';
    // Aktualizujemy pkdSection i resetujemy pkdCodes
    setFormData(prev => ({ ...prev, pkdSection: section, pkdCodes: [] }));
  };

  const handlePkdChange = (selectedOptions: any) => {
    const pkdValues = selectedOptions ? selectedOptions.map((option: PkdOption) => option.value) : [];
    // Aktualizujemy pkdCodes
    setFormData(prev => ({ ...prev, pkdCodes: pkdValues }));
  };

  const handleFormSubmit = () => {
    setStartNodeData(formData);
    setShowModal(false);

    const startNodeExists = nodes.some(n => n.id === 'start');

    if (startNodeExists) {
      setNodes(nds => nds.map(node => node.id === 'start' ? { ...node, data: { ...node.data, label: `Początek: ${formData.query}` } } : node));
    } else {
      const startNode: ReactFlowNode = {
        id: 'start',
        type: 'startNode',
        position: { x: 250, y: 40 },
        data: { label: `Początek: ${formData.query}` },
      };
      setNodes([startNode]);
      setIsStartNodeCreated(true);
    }
  };

  const onNodeClick = useCallback((event: React.MouseEvent, node: ReactFlowNode) => {
    if (node.id === 'start') setShowModal(true);
  }, []);

  const onConnect = (params: ReactFlowEdge | ReactFlowConnection) => setEdges((eds) => addEdge(params, eds));

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData('application/reactflow');
      if (typeof type === 'undefined' || !type) return;

      const position = reactFlowInstance.project({ x: event.clientX - reactFlowBounds.left, y: event.clientY - reactFlowBounds.top });
      const newNode: ReactFlowNode = { id: getId(), type: 'agentNode', position, data: { label: `${type} Agent` } };
      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: ReactFlowNode) => {
    event.preventDefault();
    if (node.id === 'start') return;
    setMenu({ id: node.id, top: event.clientY, left: event.clientX });
  }, [setMenu]);

  const onPaneClick = useCallback(() => setMenu(null), [setMenu]);

  const deleteNode = useCallback((idToDelete: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== idToDelete));
    setMenu(null);
  }, [setNodes]);

  return (
    <>
      {!isStartNodeCreated && <div className="start-button-wrapper"><Button onClick={() => setShowModal(true)} size="lg">Rozpocznij Konfigurację</Button></div>}
      <div className="dndflow">
          <Sidebar />
          <div className="reactflow-wrapper" ref={reactFlowWrapper}>
            <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onPaneClick={onPaneClick} onNodeContextMenu={onNodeContextMenu} onNodeClick={onNodeClick} onDrop={onDrop} onDragOver={onDragOver} nodeTypes={nodeTypes} translateExtent={[[ -2500, -2500 ], [ 2500, 2500 ]]} minZoom={0.1} fitView>
              <Controls />
              <MiniMap />
              <Background />
            </ReactFlow>
          </div>
          {menu && <ContextMenu {...menu} onClose={onPaneClick} onDelete={deleteNode} />}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg">
        <Modal.Header closeButton><Modal.Title>Konfiguracja Początkowa</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3"><Form.Label>Szukana usługa lub specjalizacja</Form.Label><Form.Control type="text" name="query" value={formData.query} onChange={handleFormChange} placeholder="np. układanie kostki brukowej" /></Form.Group>
            <Row>
              <Col md={8}><Form.Group className="mb-3"><Form.Label>Miasto</Form.Label><Form.Control type="text" name="city" value={formData.city} onChange={handleFormChange} placeholder="np. Kraków" /></Form.Group></Col>
              <Col md={4}><Form.Group className="mb-3"><Form.Label>Promień (km)</Form.Label><Form.Control type="number" name="radius" value={formData.radius} onChange={handleFormChange} /></Form.Group></Col>
            </Row>
            <Form.Group className="mb-3"><Form.Label>Województwo</Form.Label><Form.Control type="text" name="province" value={formData.province} onChange={handleFormChange} placeholder="np. małopolskie" /></Form.Group>
            
            <Form.Group className="mb-3">
                <Form.Label>1. Wybierz główną sekcję PKD</Form.Label>
                <Select
                    name="pkd-section"
                    options={pkdSectionOptions}
                    className="basic-single"
                    classNamePrefix="select"
                    placeholder="Wybierz sekcję..."
                    onChange={handlePkdSectionChange}
                    isClearable
                    value={pkdSectionOptions.find(option => option.value === formData.pkdSection)}
                />
            </Form.Group>

            <Form.Group className="mb-3">
                <Form.Label>2. Wybierz kody PKD (maks. 3)</Form.Label>
                <Select
                    isMulti
                    name="pkdCodes"
                    options={pkdSubclassOptions}
                    className="basic-multi-select"
                    classNamePrefix="select"
                    placeholder="Zacznij pisać, aby wyszukać..."
                    onChange={handlePkdChange}
                    value={pkdSubclassOptions.filter(option => formData.pkdCodes.includes(option.value))}
                    isOptionDisabled={() => formData.pkdCodes.length >= 3}
                    isDisabled={!formData.pkdSection}
                    noOptionsMessage={() => !formData.pkdSection ? 'Najpierw wybierz sekcję PKD' : 'Brak opcji'}
                />
            </Form.Group>

          </Form>
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" onClick={() => setShowModal(false)}>Anuluj</Button><Button variant="primary" onClick={handleFormSubmit}>Zapisz</Button></Modal.Footer>
      </Modal>
    </>
  );
};

const WorkflowBuilder = () => (<ReactFlowProvider><DnDFlow /></ReactFlowProvider>)

export default WorkflowBuilder;
