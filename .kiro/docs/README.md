# 📚 Documentação do Projeto

Esta pasta contém toda a documentação técnica e guias do projeto, organizados por categoria.

## 📁 Estrutura de Documentação

### 🔧 Flow Corrections
**Pasta:** `flow-corrections/`

Documentação completa das correções aplicadas ao fluxo de atendimento para garantir conformidade com as regras obrigatórias.

#### Arquivos:
- **`executive-summary.md`** - Resumo executivo para gestores
- **`implementation-guide.md`** - Guia completo de implementação
- **`technical-analysis.md`** - Análise técnica detalhada

#### Acesso Rápido:
```bash
# Aplicar correções
cd clerk-agents-api
./scripts/apply-flow-corrections.sh

# Ler documentação
cat .kiro/docs/flow-corrections/executive-summary.md
```

---

## 📋 Padrões de Documentação

### Estrutura de Pastas
```
.kiro/
├── docs/
│   ├── README.md (este arquivo)
│   ├── flow-corrections/
│   │   ├── executive-summary.md
│   │   ├── implementation-guide.md
│   │   └── technical-analysis.md
│   └── [outras-categorias]/
├── settings/
└── [outras-pastas-kiro]/
```

### Convenções de Nomenclatura
- **executive-summary.md** - Resumos executivos
- **implementation-guide.md** - Guias de implementação
- **technical-analysis.md** - Análises técnicas detalhadas
- **README.md** - Índices e visões gerais

### Categorias de Documentação
- **flow-corrections/** - Correções de fluxo
- **api-docs/** - Documentação de APIs
- **deployment/** - Guias de deploy
- **troubleshooting/** - Solução de problemas

---

## 🎯 Próximas Documentações

Futuras documentações devem seguir esta estrutura:

1. Criar pasta específica em `.kiro/docs/[categoria]/`
2. Incluir os 3 arquivos padrão quando aplicável:
   - `executive-summary.md`
   - `implementation-guide.md` 
   - `technical-analysis.md`
3. Atualizar este README.md com a nova categoria

---

*Documentação organizada em: 2026-04-19*  
*Estrutura: .kiro/docs/[categoria]/[tipo].md*