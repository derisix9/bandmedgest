# Backup e restauro por escola — um ficheiro, no próprio Supabase

O administrador da escola, em **Configurações → Segurança & Backups**:

- **Baixar backup** → escolha o **tipo de ficheiro** (JSON, XLSX, SQL ou CSV) e descarrega `bandmed_<escola>_<data>.<tipo>`.
- **Carregar backup** → escolha o mesmo tipo de ficheiro, seleccione-o, confirma com `RESTAURAR` e a escola passa a ter exactamente os dados do ficheiro (mais antigo = voltar atrás; mais recente = actualizar).

Antes de restaurar, a app descarrega sozinha o estado actual (`..._antes-do-restauro_...json`), para poder desfazer carregando esse ficheiro.

## Tipos de ficheiro
| Tipo | Como é | Restauro |
|---|---|---|
| JSON | objecto completo (recomendado) | directo |
| XLSX | folhas info/registos/documentos/prematricula/referencia; células longas partidas em partes | a app lê as folhas |
| CSV | um ficheiro plano (`section,collection,id,…,data`) | a app lê as linhas |
| SQL | INSERTs legíveis | a app só lê este formato estrito (nunca executa SQL) |
O tipo escolhido tem de coincidir com o do ficheiro. A cópia "antes do restauro" é sempre JSON.

## Instalação (uma vez)
Aplicar a migração `supabase/migrations/0012_school_backup_file.sql` (`supabase db push`, ou colar o ficheiro no SQL Editor e clicar Run). **Sem isto a app mostra 404 em `/rpc/school_backup_export`.** A migração termina com `notify pgrst, 'reload schema'`. Não há segredos, bucket, Edge Function nem agendador.

Se uma escola for grande e o restauro der "tempo esgotado", suba o limite do papel `authenticated` (por omissão 8 s no Supabase):
```sql
alter role authenticated set statement_timeout = '120s';
notify pgrst, 'reload config';
```

## O que o ficheiro leva
| Parte | Baixar | Restaurar |
|---|---|---|
| Registos (alunos, turmas, notas, matrículas…) | sim | **substitui** os da escola |
| Documentos da escola (definições, calendário, pautas, assiduidade) | sim | **substitui** |
| Pré-matrícula online (config., pedidos, estados, reclamações, anos) | sim | **substitui** |
| Facturas | sim | as existentes **ficam como estão**; só se recriam as que faltam |
| Pagamentos, documentos fiscais | sim (só referência) | **nunca** se tocam (imutáveis) |
| Auditoria | não | nunca se toca; o restauro acrescenta UMA entrada-resumo |
| Contas de utilizador, palavras-passe, acessos personalizados | não | não se tocam |

## Segurança
- Só o **administrador activo**; a escola vem sempre do perfil autenticado, nunca do ficheiro. Um ficheiro de outra escola é recusado.
- Uma só transacção: se o ficheiro estiver corrompido, a escola fica exactamente como estava.
- O ficheiro **não é cifrado** e contém dados pessoais: guarde-o em local seguro (não em e-mail nem em pastas partilhadas).
- Colecções desconhecidas (ficheiro de uma versão futura) são ignoradas e contadas no resumo; uma versão de formato superior à suportada é recusada.

## Importante
O ficheiro é uma cópia por escola, feita **à mão**. Não substitui o `pg_dump` global (`.github/workflows/backup.yml`), que protege contra a perda do projecto inteiro. Peça aos administradores que baixem um backup regularmente, ou active a **cópia diária automática para a nuvem da escola** (`docs/BACKUP_EXTERNO.md`).

## Testes
`npm test` (unitários) e `npm run test:db` (Postgres real: exportar, restaurar, recusas, escola errada, atomicidade, pagamentos intactos).

## Edge Functions (criar escola/administrador)
Publique com `supabase functions deploy register-institution --no-verify-jwt` (e `create-user`, `delete-user`). Se o painel tiver "Verify JWT" ligado em `register-institution`, o pedido prévio (OPTIONS) recebe 401 e o navegador mostra erro de CORS. Defina `supabase secrets set REGISTRATION_CODE=...`; opcional `ALLOWED_ORIGIN=https://a-sua-app`.
