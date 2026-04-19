# 🤖 Kiro - Configurações do Projeto

Esta pasta contém todas as configurações e documentações específicas do Kiro para este projeto.

## 📁 Estrutura Organizada

```
.kiro/
├── README.md (este arquivo)
├── docs/                    # 📚 Documentação técnica
│   ├── README.md           # Índice da documentação
│   └── flow-corrections/   # Correções do fluxo de atendimento
│       ├── executive-summary.md
│       ├── implementation-guide.md
│       └── technical-analysis.md
├── settings/               # ⚙️ Configurações
│   └── README.md          # Guia de configurações
└── .gitignore             # Regras de versionamento
```

## 🎯 Acesso Rápido

### 📋 Correções do Fluxo (Mais Recente)
```bash
# Aplicar correções
./scripts/apply-flow-corrections.sh

# Ler resumo executivo
cat .kiro/docs/flow-corrections/executive-summary.md

# Ler guia completo
cat .kiro/docs/flow-corrections/implementation-guide.md
```

### 📚 Documentação Completa
```bash
# Índice de toda documentação
cat .kiro/docs/README.md

# Navegar pelas categorias
ls .kiro/docs/
```

### ⚙️ Configurações
```bash
# Ver configurações disponíveis
cat .kiro/settings/README.md

# Listar configurações
ls .kiro/settings/
```

## 📋 Padrões do Projeto

### Organização de Documentação
- **Sempre criar em `.kiro/docs/[categoria]/`**
- **Usar nomenclatura padronizada:**
  - `executive-summary.md` - Para gestores
  - `implementation-guide.md` - Para desenvolvedores
  - `technical-analysis.md` - Para análise técnica

### Configurações
- **Arquivos sensíveis em `.kiro/settings/`**
- **Sempre criar examples para configurações**
- **Nunca versionar secrets ou dados pessoais**

### Versionamento
- **Documentação:** Sempre versionada
- **Configurações públicas:** Versionadas
- **Configurações privadas:** Ignoradas pelo git

## 🔄 Próximas Adições

Quando adicionar nova documentação ou configuração:

1. **Documentação:** Criar em `.kiro/docs/[nova-categoria]/`
2. **Configuração:** Criar em `.kiro/settings/`
3. **Atualizar READMEs** correspondentes
4. **Seguir padrões** estabelecidos

---

## 📞 Suporte

Para dúvidas sobre a organização do Kiro:
- 📚 Consulte a documentação em `docs/`
- ⚙️ Verifique configurações em `settings/`
- 🔧 Execute scripts em `../scripts/`

---

*Estrutura Kiro organizada em: 2026-04-19*  
*Padrão: .kiro/[categoria]/[arquivos]*