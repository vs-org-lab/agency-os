import type { ProcessDefinition } from '../domain/template';

export const ORBIT_TEMPLATE_KEY = 'orbit';

export const ORBIT_TEMPLATE_NAME = 'Orbit';

/** The default process: its phases follow the pipeline codes 2.3 to 2.9. */
export const ORBIT_PROCESS: ProcessDefinition = {
  phases: [
    {
      name: 'Descoberta e arquitetura',
      requiresApproval: true,
      codeOnStart: '2.3',
      codeOnDone: '2.4',
      steps: [
        { name: 'Questionário de descoberta', visibleToClient: true, chained: false },
        { name: 'Análise técnica', visibleToClient: false, chained: true },
        { name: 'Arquitetura e mapa de conteúdos', visibleToClient: true, chained: true },
      ],
    },
    {
      name: 'Produção',
      requiresApproval: false,
      codeOnStart: '2.5',
      codeOnDone: null,
      steps: [
        { name: 'Design das páginas principais', visibleToClient: false, chained: false },
        { name: 'Desenvolvimento', visibleToClient: false, chained: true },
        { name: 'Integração de conteúdos', visibleToClient: true, chained: true },
      ],
    },
    {
      name: 'QA interno',
      requiresApproval: false,
      codeOnStart: '2.6',
      codeOnDone: null,
      steps: [
        { name: 'Testes funcionais e de desempenho', visibleToClient: false, chained: false },
        { name: 'Revisão de acessibilidade', visibleToClient: false, chained: true },
      ],
    },
    {
      name: 'Apresentação e feedback',
      requiresApproval: true,
      codeOnStart: '2.7',
      codeOnDone: null,
      steps: [
        { name: 'Apresentação ao cliente', visibleToClient: true, chained: false },
        { name: 'Recolha de feedback', visibleToClient: true, chained: true },
      ],
    },
    {
      name: 'Ajustes finais',
      requiresApproval: false,
      codeOnStart: '2.8',
      codeOnDone: null,
      steps: [{ name: 'Ajustes acordados', visibleToClient: true, chained: false }],
    },
    {
      name: 'Lançamento',
      requiresApproval: false,
      codeOnStart: '2.9',
      codeOnDone: null,
      steps: [
        { name: 'Publicação', visibleToClient: true, chained: false },
        { name: 'Formação da equipa do cliente', visibleToClient: true, chained: true },
      ],
    },
  ],
};
