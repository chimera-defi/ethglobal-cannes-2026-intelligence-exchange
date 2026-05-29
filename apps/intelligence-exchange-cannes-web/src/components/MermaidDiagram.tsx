import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    background: '#0D1625',
    mainBkg: '#0D1625',
    nodeBorder: '#3B82F6',
    lineColor: '#64748B',
    textColor: '#E2E8F0',
    fontSize: '13px',
  },
});

let diagramId = 0;
export function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');
  const id = useRef('mermaid-' + diagramId++);

  useEffect(() => {
    mermaid.render(id.current, chart).then(({ svg }) => setSvg(svg)).catch(console.error);
  }, [chart]);

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: svg }} className='overflow-x-auto' />;
}