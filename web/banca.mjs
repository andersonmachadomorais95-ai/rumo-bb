export const bancaProfile = {
 analysisDate: '24/10/2026',
 editionSummary: {
  questions: 140,
  nonAnnulled: 139,
  years: [2021, 2023],
 },
 selection: {
  title: 'Seleção Externa 2022/001',
  objectiveQuestions: 70,
  totalPoints: 100,
  basicQuestions: 25,
  basicPoints: 32.5,
  specificQuestions: 45,
  specificPoints: 67.5,
  writingStage: 'Redação em etapa eliminatória, conforme as regras de habilitação do edital.',
  elimination:
   'No edital analisado, era necessário obter ao menos 50 pontos no total, 16,25 em Conhecimentos Básicos e 33,75 em Conhecimentos Específicos, sem zerar disciplina.',
 },
 role: {
  formalTitle: 'Escriturário',
  relationshipTitle: 'Agente Comercial',
  education: 'Nível médio',
  hours: '30 horas semanais',
  duties: [
   'Orientar clientes sobre produtos e serviços do Conglomerado BB.',
   'Atender com presteza e cortesia, zelando pela qualidade das informações e dos serviços.',
   'Conferir e processar documentos, atualizar registros e organizar arquivos.',
   'Resguardar informações e dados sob sua responsabilidade.',
   'Executar operações e aplicações de clientes conforme as normas vigentes.',
  ],
  source: 'Edital nº 01 — Seleção Externa 2022/001 BB, de 22/12/2022, itens 2.1 e 2.1.4–2.1.5.',
 },
 sourceNote:
  'Classificação editorial assistida por IA, não oficial. Foram lidos 70 itens do caderno B/1 de 2021 e 70 do caderno A/1 de 2023; cada item recebeu um único eixo principal. As contagens de incidência incluem a questão posteriormente anulada.',
 years: [
  { year: 2021, edition: 'Agente Comercial · Prova B/1 · 26/09/2021', questions: 70, nonAnnulled: 70 },
  { year: 2023, edition: 'Agente Comercial · Prova A/1 · 23/04/2023', questions: 70, nonAnnulled: 69 },
 ],
 subjects: [
  {
   name: 'Língua Portuguesa', group: 'Básicos', points: 15, questions: 10, questions2018: 5, points2018: 5,
   axes: [
    ['Gramática normativa e sintaxe', 4, 4],
    ['Interpretação e linguagem', 4, 3],
    ['Coesão e relações semânticas', 2, 3],
   ],
   tip: 'Equilibre interpretação, gramática e coesão. No recorte, concordância, sintaxe, crase, pontuação e reescrita convivem com leitura de texto.',
  },
  {
   name: 'Língua Inglesa', group: 'Básicos', points: 5, questions: 5, questions2018: 5, points2018: 5,
   axes: [
    ['Compreensão de texto', 3, 1],
    ['Vocabulário e sentido', 0, 3],
    ['Coesão e conectores', 2, 0],
    ['Gramática contextualizada', 0, 1],
   ],
   tip: 'Treine leitura global, localização de informação, vocabulário e conectores em textos; uma edição sozinha não representa todo o formato.',
  },
  {
   name: 'Matemática', group: 'Básicos', points: 7.5, questions: 5, questions2018: 5, points2018: 10,
   axes: [
    ['Funções', 2, 1],
    ['Sequências e progressões', 1, 1],
    ['Aritmética e porcentagem', 1, 0],
    ['Conjuntos e números', 1, 0],
    ['Lógica proposicional', 0, 1],
    ['Sistemas lineares', 0, 1],
    ['Análise combinatória', 0, 1],
   ],
   tip: 'Funções e sequências somam metade da amostra; preserve espaço para porcentagem, conjuntos, lógica, sistemas e combinatória.',
  },
  {
   name: 'Atualidades do Mercado Financeiro', group: 'Básicos', points: 5, questions: 5, questions2018: 5, points2018: 5,
   axes: [
    ['Blockchain e criptoativos', 2, 1],
    ['Bancos digitais e fintechs', 1, 1],
    ['Funções da moeda', 1, 1],
    ['Shadow banking', 1, 1],
    ['Pagamentos digitais e Pix', 0, 1],
   ],
   tip: 'Os tópicos se distribuíram por diferentes conceitos e modelos digitais. Como os exemplos são datados, confirme a vigência antes de estudar regras atuais.',
  },
  {
   name: 'Matemática Financeira', group: 'Específicos', points: 7.5, questions: 5, questions2018: 0, points2018: 0,
   axes: [
    ['Juros compostos e equivalência', 1, 4],
    ['Juros simples e taxas básicas', 2, 1],
    ['Sistemas de amortização', 2, 0],
   ],
   tip: 'Juros compostos e equivalência foram frequentes no recorte; juros simples, SAC e Price também apareceram e merecem cobertura.',
  },
  {
   name: 'Conhecimentos Bancários', group: 'Específicos', points: 15, questions: 10, questions2018: 5, points2018: 7.5,
   axes: [
    ['Câmbio e fluxos de capitais', 1, 4],
    ['Proteção de dados e prevenção a ilícitos', 2, 1],
    ['Sistema Financeiro Nacional', 2, 1],
    ['Ética e responsabilidade socioambiental', 2, 1],
    ['Mercado de capitais', 2, 0],
    ['Política monetária', 1, 1],
    ['Segurança cibernética bancária', 0, 1],
    ['Tesouraria bancária', 0, 1],
   ],
   tip: 'Câmbio cresceu de um item em 2021 para quatro em 2023, mas a amostra também cobre SFN, ética, dados, política monetária e mercado de capitais.',
  },
  {
   name: 'Conhecimentos de Informática', group: 'Específicos', points: 22.5, questions: 15, questions2018: 25, points2018: 37.5,
   axes: [
    ['Internet, redes e correio eletrônico', 5, 3],
    ['Office e colaboração', 3, 4],
    ['Dados, BI e suporte à decisão', 3, 2],
    ['Segurança da informação', 1, 3],
    ['Multimídia e educação a distância', 1, 2],
    ['Sistemas operacionais e arquivos', 1, 1],
    ['Redes sociais e mensageria', 1, 0],
   ],
   tip: 'Internet/redes e Office/colaboração somam metade dos itens da amostra. A prova também distribuiu questões por dados, segurança, multimídia e sistemas.',
  },
  {
   name: 'Vendas e Negociação', group: 'Específicos', points: 22.5, questions: 15, questions2018: 0, points2018: 0,
   axes: [
    ['Marketing digital e canais', 4, 3],
    ['Experiência, relacionamento e valor', 2, 4],
    ['Normas de relacionamento e proteção', 3, 3],
    ['Características e qualidade dos serviços', 3, 2],
    ['Estratégia e posicionamento', 1, 2],
    ['Técnicas e ética de vendas', 1, 1],
    ['Aprendizagem organizacional', 1, 0],
   ],
   tip: 'É uma das duas maiores áreas em pontos. Combine cenários de atendimento, relacionamento e qualidade com canais, normas, estratégia e ética.',
  },
  {
   name: 'Probabilidade e Estatística', group: 'Contexto 2018', points: 0, questions: 0, questions2018: 20, points2018: 30,
   axes: [],
   tip: 'Apareceu com 20 itens no caderno de 2018, mas não integrou os dois cadernos comerciais analisados. Não use 2018 para transferir pesos ao perfil de Agente Comercial.',
  },
 ],
};
