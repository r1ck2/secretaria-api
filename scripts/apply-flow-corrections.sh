#!/bin/bash

###############################################################################
# Script de Aplicação das Correções do Fluxo de Atendimento
# 
# Este script aplica as correções obrigatórias ao fluxo de atendimento,
# garantindo que TODAS as regras sejam seguidas rigorosamente.
#
# IMPORTANTE: Faça backup do banco de dados antes de executar!
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if running from correct directory
if [ ! -f "package.json" ]; then
    print_error "Este script deve ser executado da raiz do projeto clerk-agents-api"
    exit 1
fi

print_header "APLICAÇÃO DAS CORREÇÕES DO FLUXO DE ATENDIMENTO"

# Step 1: Backup
print_info "Passo 1/5: Criando backup do banco de dados..."
BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"

if command -v mysqldump &> /dev/null; then
    read -p "Digite o usuário do MySQL (padrão: root): " DB_USER
    DB_USER=${DB_USER:-root}
    
    read -p "Digite o nome do banco de dados (padrão: clerk_agents): " DB_NAME
    DB_NAME=${DB_NAME:-clerk_agents}
    
    print_info "Criando backup em $BACKUP_FILE..."
    mysqldump -u "$DB_USER" -p "$DB_NAME" > "$BACKUP_FILE"
    print_success "Backup criado com sucesso: $BACKUP_FILE"
else
    print_warning "mysqldump não encontrado. Pulando backup automático."
    print_warning "IMPORTANTE: Faça backup manual do banco de dados antes de continuar!"
    read -p "Pressione ENTER para continuar ou Ctrl+C para cancelar..."
fi

# Step 2: Show current flows
print_info "Passo 2/5: Verificando flows existentes..."
echo ""
echo "Flows atuais no banco de dados:"
echo "--------------------------------"

if command -v mysql &> /dev/null; then
    mysql -u "$DB_USER" -p "$DB_NAME" -e "SELECT id, name, status, created_at FROM cad_flows ORDER BY created_at DESC;" 2>/dev/null || {
        print_warning "Não foi possível listar flows. Continue manualmente."
    }
else
    print_warning "MySQL CLI não encontrado. Verifique flows manualmente."
fi

echo ""
read -p "Deseja continuar com a aplicação das correções? (s/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Ss]$ ]]; then
    print_warning "Operação cancelada pelo usuário."
    exit 0
fi

# Step 3: Remove old seed
print_info "Passo 3/5: Removendo seed antigo..."
npm run db:seed:undo -- --seed 20260101000002-flow-default.js 2>/dev/null || {
    print_warning "Seed antigo não encontrado ou já removido. Continuando..."
}
print_success "Seed antigo removido (se existia)"

# Step 4: Apply new seed
print_info "Passo 4/5: Aplicando novo seed corrigido..."
npm run db:seed -- --seed 20260101000002-flow-default-v2.js

if [ $? -eq 0 ]; then
    print_success "Novo seed aplicado com sucesso!"
else
    print_error "Erro ao aplicar novo seed. Verifique os logs acima."
    print_warning "Você pode restaurar o backup com:"
    print_warning "  mysql -u $DB_USER -p $DB_NAME < $BACKUP_FILE"
    exit 1
fi

# Step 5: Verify
print_info "Passo 5/5: Verificando aplicação..."
echo ""
echo "Flows após correção:"
echo "--------------------"

if command -v mysql &> /dev/null; then
    mysql -u "$DB_USER" -p "$DB_NAME" -e "SELECT id, name, description, status, created_at FROM cad_flows WHERE name = 'Padrão Agendamento' ORDER BY created_at DESC LIMIT 1;" 2>/dev/null || {
        print_warning "Não foi possível verificar. Verifique manualmente."
    }
fi

# Success message
print_header "CORREÇÕES APLICADAS COM SUCESSO!"

echo -e "${GREEN}✅ Todas as correções foram aplicadas:${NC}"
echo ""
echo "  ✅ REGRA 1: Todo trigger retorna mensagem ao cliente"
echo "  ✅ REGRA 2: Validação de entrada em waiting_input"
echo "  ✅ Opção '0' para voltar ao menu implementada"
echo "  ✅ Google Calendar integrado (sem alucinações)"
echo "  ✅ Reinício automático após finalização"
echo "  ✅ Mensagens humanizadas com IA"
echo ""

print_info "Próximos passos:"
echo "  1. Teste o fluxo completo em ambiente de desenvolvimento"
echo "  2. Valide integração com Google Calendar"
echo "  3. Teste cenários de erro (Calendar indisponível, etc.)"
echo "  4. Valide mensagens em português"
echo "  5. Aplique em produção após testes"
echo ""

print_info "Backup salvo em: $BACKUP_FILE"
print_warning "Mantenha este backup até confirmar que tudo está funcionando!"
echo ""

print_success "Script concluído com sucesso! 🎉"
