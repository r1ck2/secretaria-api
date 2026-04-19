# ⚙️ Configurações do Kiro

Esta pasta contém configurações específicas do Kiro para este projeto.

## 📁 Estrutura de Configurações

```
.kiro/settings/
├── README.md (este arquivo)
├── example.* (arquivos de exemplo)
├── template.* (templates de configuração)
└── [arquivos de configuração local - ignorados pelo git]
```

## 🔧 Tipos de Configuração

### Arquivos Públicos (versionados)
- **example.*** - Exemplos de configuração
- **template.*** - Templates para copiar
- **README.md** - Documentação

### Arquivos Privados (ignorados pelo git)
- **local.*** - Configurações locais específicas
- **secrets.*** - Informações sensíveis
- **\*.key, \*.pem** - Chaves e certificados

## 📋 Convenções

1. **Sempre criar examples** para configurações sensíveis
2. **Nunca versionar secrets** ou dados pessoais
3. **Documentar todas as configurações** neste README
4. **Usar nomenclatura clara** e consistente

---

*Configurações organizadas em: 2026-04-19*