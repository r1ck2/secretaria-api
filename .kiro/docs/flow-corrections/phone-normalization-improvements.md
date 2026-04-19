# 📞 Melhorias na Normalização de Números de Telefone

## 📋 Problemas Identificados e Corrigidos

### 🐛 **Problema 1: Números com @lid não eram processados**

**Erro:** `Invalid or missing phone number after normalization`  
**Causa:** Números com sufixo `@lid` não eram tratados corretamente  
**Exemplo:** `18721896698079@lid`

#### ✅ **Solução Implementada:**

1. **Detecção de números LID**
   - Sistema agora detecta sufixo `@lid`
   - Extrai número real do campo `senderPn`
   - Usa `senderPn` como número válido

2. **Tratamento de múltiplos sufixos**
   ```typescript
   // ANTES: Apenas @s.whatsapp.net
   const rawNumber = remoteJid.replace("@s.whatsapp.net", "");
   
   // DEPOIS: Múltiplos sufixos
   const rawNumber = remoteJid
     .replace("@s.whatsapp.net", "")
     .replace("@lid", "")
     .replace("@g.us", "")
     .replace(/\D/g, "");
   ```

---

### 🐛 **Problema 2: Números com/sem 9º dígito não eram encontrados**

**Contexto:** No Brasil, números móveis mudaram de 8 para 9 dígitos entre 2015-2017  
**Problema:** Cliente cadastrado com número antigo (8 dígitos) não era encontrado quando enviava mensagem com número novo (9 dígitos) ou vice-versa

**Exemplos:**
- Cadastrado: `(27) 9838-5883` → `2798385883` (10 dígitos)
- Mensagem vem: `(27) 99838-5883` → `27998385883` (11 dígitos)
- Resultado: Cliente não encontrado ❌

#### ✅ **Solução Implementada:**

Função `getPhoneNumberVariations()` agora retorna TODAS as variações possíveis:

```typescript
// Exemplo: Número com 11 dígitos (novo formato)
getPhoneNumberVariations("27998385883")
// Retorna:
[
  "27998385883",      // Sem código do país
  "5527998385883",    // Com código do país
  "2798385883",       // SEM o 9º dígito (formato antigo)
  "552798385883",     // SEM o 9º dígito + código do país
]

// Exemplo: Número com 10 dígitos (formato antigo)
getPhoneNumberVariations("2798385883")
// Retorna:
[
  "2798385883",       // Sem código do país
  "552798385883",     // Com código do país
  "27998385883",      // COM o 9º dígito (formato novo)
  "5527998385883",    // COM o 9º dígito + código do país
]
```

**Lógica implementada:**
1. Se número tem 11 dígitos E começa com 9 → gera variação SEM o 9
2. Se número tem 10 dígitos E começa com 9/8/7/6 → gera variação COM o 9
3. Retorna array com todas as variações (sem duplicatas)

---

## 🔧 Arquivos Modificados

### 1. **`src/utils/phoneNormalizer.ts`**

#### Função `getPhoneNumberVariations()` melhorada:

```typescript
// ── BRAZIL SPECIFIC: Handle 9th digit variations ──
if (normalized.countryCode === COUNTRY_CODES.BRAZIL) {
  const phoneWithoutCountry = normalized.normalized;
  
  // If phone has 11 digits (new format with 9)
  if (phoneWithoutCountry.length === 11) {
    const areaCode = phoneWithoutCountry.substring(0, 2);
    const firstDigit = phoneWithoutCountry.substring(2, 3);
    
    if (firstDigit === "9") {
      // Create variation WITHOUT the 9th digit
      const withoutNinth = areaCode + phoneWithoutCountry.substring(3);
      variations.push(withoutNinth);
      variations.push(normalized.countryCode + withoutNinth);
    }
  }
  
  // If phone has 10 digits (old format without 9)
  if (phoneWithoutCountry.length === 10) {
    const areaCode = phoneWithoutCountry.substring(0, 2);
    const firstDigit = phoneWithoutCountry.substring(2, 3);
    
    if (["9", "8", "7", "6"].includes(firstDigit)) {
      // Create variation WITH the 9th digit
      const withNinth = areaCode + "9" + phoneWithoutCountry.substring(2);
      variations.push(withNinth);
      variations.push(normalized.countryCode + withNinth);
    }
  }
}
```

### 2. **`src/modules/flowEngine/flowEngine.controller.ts`**

#### Tratamento de números LID:

```typescript
// ── SPECIAL CASE: @lid numbers - extract actual phone from senderPn ──
if (isLidNumber && data.key?.senderPn) {
  const senderPnRaw = data.key.senderPn.replace("@s.whatsapp.net", "").replace(/\D/g, "");
  const senderPnNormalization = normalizePhoneNumber(senderPnRaw);
  
  if (senderPnNormalization.isValid) {
    // Use senderPn as the actual phone number
    rawNumber = senderPnRaw;
  }
}
```

---

## 📊 Casos de Uso Cobertos

### ✅ **Caso 1: Cliente com número antigo cadastrado**
```
Cadastro: 2798385883 (10 dígitos)
Mensagem: 27998385883 (11 dígitos)
Resultado: ✅ Cliente encontrado
```

### ✅ **Caso 2: Cliente com número novo cadastrado**
```
Cadastro: 27998385883 (11 dígitos)
Mensagem: 2798385883 (10 dígitos)
Resultado: ✅ Cliente encontrado
```

### ✅ **Caso 3: Número com @lid**
```
remoteJid: 18721896698079@lid
senderPn: 553799368807@s.whatsapp.net
Resultado: ✅ Usa senderPn como número válido
```

### ✅ **Caso 4: Mensagens de grupo**
```
remoteJid: 120363123456789@g.us
Resultado: ✅ Ignorado (não processa grupos)
```

---

## 🎯 Benefícios

1. **Compatibilidade Total:** Funciona com números antigos e novos
2. **Busca Eficiente:** Encontra cliente independente do formato
3. **Suporte a LID:** Processa números com sufixo @lid
4. **Logs Detalhados:** Rastreamento completo de normalização
5. **Sem Duplicatas:** Remove variações duplicadas automaticamente

---

## 📈 Monitoramento

### Verificar normalização de números:

```sql
-- Verificar números LID processados
SELECT * FROM cad_logs 
WHERE action = 'webhook_lid_number_resolved' 
AND created_at > NOW() - INTERVAL 24 HOUR
ORDER BY created_at DESC;

-- Verificar números inválidos (deve diminuir)
SELECT * FROM cad_logs 
WHERE action = 'webhook_invalid_number' 
AND created_at > NOW() - INTERVAL 24 HOUR
ORDER BY created_at DESC;

-- Verificar extração de números
SELECT 
  JSON_EXTRACT(metadata, '$.suffix_detected') as suffix_type,
  JSON_EXTRACT(metadata, '$.is_valid') as is_valid,
  COUNT(*) as count
FROM cad_logs 
WHERE action = 'webhook_number_extraction'
AND created_at > NOW() - INTERVAL 24 HOUR
GROUP BY suffix_type, is_valid;
```

### Verificar busca de clientes:

```sql
-- Clientes encontrados vs não encontrados
SELECT 
  CASE 
    WHEN action = 'customer_lookup' AND JSON_EXTRACT(metadata, '$.customer_found') = true THEN 'Encontrado'
    WHEN action = 'customer_lookup' AND JSON_EXTRACT(metadata, '$.customer_found') = false THEN 'Não Encontrado'
    ELSE 'Outro'
  END as status,
  COUNT(*) as quantidade
FROM cad_logs 
WHERE action = 'customer_lookup'
AND created_at > NOW() - INTERVAL 24 HOUR
GROUP BY status;
```

---

## 🔧 Como Aplicar

```bash
# 1. As correções já foram aplicadas no código fonte
# Arquivos modificados:
# - clerk-agents-api/src/utils/phoneNormalizer.ts
# - clerk-agents-api/src/modules/flowEngine/flowEngine.controller.ts

# 2. Rebuild da aplicação
cd clerk-agents-api
npm run build

# 3. Restart do serviço
pm2 restart clerk-agents-api
# ou
docker-compose restart clerk-agents-api

# 4. Testar normalização
# Enviar mensagem de número com 10 dígitos
# Enviar mensagem de número com 11 dígitos
# Verificar se ambos encontram o cliente
```

---

## 🚨 Próximos Passos

1. ✅ **Deploy** das melhorias
2. ✅ **Monitorar logs** de normalização
3. ✅ **Testar** com números reais (10 e 11 dígitos)
4. ✅ **Validar** que clientes são encontrados corretamente
5. ✅ **Coletar feedback** sobre números LID

---

## 📝 Notas Técnicas

### Sobre o 9º Dígito no Brasil

- **Mudança:** 2015-2017 (variou por estado)
- **Formato antigo:** (XX) XXXX-XXXX (8 dígitos + DDD)
- **Formato novo:** (XX) 9XXXX-XXXX (9 dígitos + DDD)
- **Regra:** Adiciona "9" antes do número móvel

### Sobre Números LID

- **LID:** Local Identifier (identificador local do WhatsApp)
- **Formato:** `XXXXXXXXXX@lid`
- **Campo real:** `senderPn` contém o número de telefone real
- **Uso:** WhatsApp Business API em alguns casos

---

*Melhorias implementadas em: 2026-04-19*  
*Versão: 2.2*  
*Status: ✅ Pronto para deploy*
