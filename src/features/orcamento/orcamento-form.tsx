import type { PartnerDto } from '@/api/gerado'
import { CadastroForm } from '@/components/cabinet/cadastro-form'
import {
  fileirasTotais,
  totalItemCentavos,
  useSubtotalCentavos,
} from '@/components/cabinet/documento'
import {
  DateField,
  LookupSelectField,
  RadioField,
  SelectField,
  TextField,
} from '@/components/cabinet/form-controls'
import { FormGrid, type FormGridRow } from '@/components/cabinet/form-grid'
import { SearchDialog } from '@/components/cabinet/search-dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { data } from '@/data'
import { useLookupOptions } from '@/data/lookups-api'
import { tabelas } from '@/data/tabelas'
import { PERCENT_ESCALA, formatMoneyBRL, formatPercent } from '@/lib/formatters'
import { SHORTCUTS, bindShortcut, shortcutLabel } from '@/lib/shortcuts'
import type { Orcamento } from '@/mocks/orcamentos'
import { useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { FileText, Home, Lock, Package, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { z } from 'zod'

// TODO(contract): Zod do codegen substituirá este schema na integração.
export const orcamentoSchema = z.object({
  id: z.number(),
  numero: z.string(),
  serie: z.string(),
  numeroPasta: z.string(),
  dataEmissao: z.string().nullable(),
  dataValidade: z.string().nullable(),
  dataFechamento: z.string().nullable(),
  cliente: z.string().min(1, 'Cliente é obrigatório'),
  descricaoObra: z.string(),
  consultor: z.string().nullable(),
  profissionalExterno: z.string().nullable(),
  modoDesconto: z.enum(['PRODUTO', 'GERAL']),
  descontoPercentual: z.number(),
  itens: z.array(
    z.object({
      item: z.string(),
      codigoFornecedor: z.string(),
      descricaoFornecedor: z.string(),
      acabamento: z.string(),
      tamanho: z.string(),
      quantidade: z.string(),
      unidade: z.string(),
      valorUnitarioCentavos: z.number().nullable(),
      descontoPercentual: z.number().nullable(),
      grupoProduto: z.string(),
      tipoPeca: z.string(),
      fornecedor: z.string(),
      ambiente: z.string(),
    }),
  ),
})

const ITEM_VAZIO = {
  item: '',
  codigoFornecedor: '',
  descricaoFornecedor: '',
  acabamento: '',
  tamanho: '',
  quantidade: '',
  unidade: 'UN',
  valorUnitarioCentavos: null,
  descontoPercentual: null,
  grupoProduto: '',
  tipoPeca: '',
  fornecedor: '',
  ambiente: '',
}

/**
 * Botões de inserção de item (§8.2). No legado são F5/F6; o CLAUDE.md veta
 * F3-F6 (conflito com browser), então valem Alt+A / Alt+P pelo registry.
 */
function BotoesInsercao({ append }: { append: (row: FormGridRow) => void }) {
  const itens = (useWatch({ name: 'itens' }) ?? []) as unknown[]

  function inserirProduto() {
    append({ ...ITEM_VAZIO, item: String(itens.length + 1) })
  }

  function inserirAmbiente() {
    // Ambiente agrupa os itens da obra: entra como linha com ambiente definido.
    append({ ...ITEM_VAZIO, item: String(itens.length + 1), ambiente: tabelas.ambientes[0] })
  }

  useEffect(() => bindShortcut(SHORTCUTS.produto, inserirProduto))
  useEffect(() => bindShortcut(SHORTCUTS.ambiente, inserirAmbiente))
  useEffect(() =>
    bindShortcut(SHORTCUTS.imagemProduto, () => console.info('[mock] Mostrar imagem do produto')),
  )

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={inserirAmbiente}>
        <Home className="size-4" /> Ambiente ({shortcutLabel(SHORTCUTS.ambiente)})
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={inserirProduto}>
        <Package className="size-4" /> Produto ({shortcutLabel(SHORTCUTS.produto)})
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => console.info('[mock] Pré Produto (item fora do catálogo)')}
      >
        Pré Produto
      </Button>
    </>
  )
}

// Busca de cliente = `GET /api/partners?role=customer`. Chaves no nome do
// contrato porque viajam como `sortBy`.
/** Colunas de PARCEIRO — servem à busca de Cliente e à de Profissional Externo:
 * as duas são papéis do mesmo `GET /api/partners`, só o filtro `role` muda. */
const colunasParceiro: ColumnDef<PartnerDto>[] = [
  {
    accessorKey: 'code',
    header: 'Código',
    cell: ({ getValue }) => getValue<string | null>() ?? '—',
  },
  { accessorKey: 'legalName', header: 'Nome' },
]

function Cabecalho() {
  const { setValue } = useFormContext<Orcamento>()
  const [buscaClienteOpen, setBuscaClienteOpen] = useState(false)
  const [buscaProfissionalOpen, setBuscaProfissionalOpen] = useState(false)

  return (
    <>
      <div className="grid grid-cols-12 items-end gap-3">
        <TextField name="numero" label="Código" className="col-span-6 sm:col-span-2" />
        <SelectField
          name="serie"
          label="Série"
          options={tabelas.series}
          className="col-span-6 sm:col-span-1"
        />
        <TextField name="numeroPasta" label="Nº Pasta" className="col-span-6 sm:col-span-2" />
        <DateField name="dataEmissao" label="Data Emissão" className="col-span-6 sm:col-span-2" />
        <DateField name="dataValidade" label="Data Validade" className="col-span-6 sm:col-span-2" />
        <DateField
          name="dataFechamento"
          label="Data Fechamento"
          className="col-span-6 sm:col-span-2"
        />
        <div className="col-span-12 sm:col-span-5">
          <div className="flex items-end gap-1">
            <TextField name="cliente" label="Cliente" className="flex-1" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBuscaClienteOpen(true)}
            >
              <User className="size-4" /> Cliente
            </Button>
          </div>
        </div>
        {/* `[busca +...]` na transcrição (§8.2), não `[combo]` — ficou como
            `LookupSelectField kind="cargo"` por engano até esta correção: Cargo
            é a categoria de função trabalhista do Colaborador (§2), sem relação
            com "quem consultou a venda". O alvo certo segue sem tela própria
            identificável na transcrição (§10 não elucida), então o campo
            continua como estava até haver captura — só o TODO fica registrado. */}
        {/* TODO(transcricao): `Consultor(a)` é `[busca +...]` no legado; o
            cadastro que ela busca não foi identificado (§10). Não trocar por
            SearchDialog sem saber contra qual tabela. */}
        <LookupSelectField
          name="consultor"
          label="Consultor(a)"
          kind="cargo"
          className="col-span-6 sm:col-span-3"
        />
        {/* `Profissional Externo` é `[busca +...]` (§8.2), e o alvo É óbvio: o
            NOME bate literalmente com o cadastro já construído
            (`/cadastros/profissionais`). Estava como `LookupSelectField
            kind="profissional"` — a MESMA categoria genérica que o campo
            "Profissional" do Cliente usa (§5, "arquiteto"/"designer" como
            texto livre) — casando a PESSOA específica da obra com uma
            categoria solta. Corrigido para buscar a pessoa de verdade. */}
        <div className="col-span-6 sm:col-span-4">
          <div className="flex items-end gap-1">
            <TextField name="profissionalExterno" label="Profissional Externo" className="flex-1" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBuscaProfissionalOpen(true)}
            >
              <User className="size-4" /> Buscar
            </Button>
          </div>
        </div>
        <TextField
          name="descricaoObra"
          label="Descrição da Obra"
          className="col-span-12 sm:col-span-6"
        />
      </div>

      <SearchDialog
        open={buscaClienteOpen}
        onOpenChange={setBuscaClienteOpen}
        title="Busca de Cliente"
        columns={colunasParceiro}
        queryKey={['busca-cliente-orcamento']}
        fetcher={(state) => data.clientes.list(state, 0)}
        onSelect={(c) => {
          setValue('cliente', c.legalName, { shouldDirty: true })
          setBuscaClienteOpen(false)
        }}
      />
      <SearchDialog
        open={buscaProfissionalOpen}
        onOpenChange={setBuscaProfissionalOpen}
        title="Busca de Profissional Externo"
        columns={colunasParceiro}
        queryKey={['busca-profissional-orcamento']}
        fetcher={(state) => data.profissionais.list(state, 0)}
        onSelect={(p) => {
          setValue('profissionalExterno', p.legalName, { shouldDirty: true })
          setBuscaProfissionalOpen(false)
        }}
      />
    </>
  )
}

/** Desconto em 3 níveis (§8.2): por produto, por grupo e geral. */
function ControlesDesconto() {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <RadioField
        name="modoDesconto"
        label="Desconto"
        options={[
          { value: 'PRODUTO', label: 'Desconto por Produto' },
          { value: 'GERAL', label: 'Desconto Geral' },
        ]}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => console.info('[mock] Desconto Grupo')}
      >
        Desconto Grupo
      </Button>
    </div>
  )
}

function TotaisOrcamento() {
  const percentual = (useWatch({ name: 'descontoPercentual' }) as number) ?? 0

  return (
    <Tabs defaultValue="venda">
      <TabsList className="flex-wrap">
        <TabsTrigger value="venda">Totais da Venda</TabsTrigger>
        <TabsTrigger value="impostos">Totais de Impostos</TabsTrigger>
        <TabsTrigger value="frete">Frete</TabsTrigger>
      </TabsList>
      <TabsContent value="venda">
        {/* Os totais em si são as últimas fileiras da grade (DESIGN.md
            §DocumentoTotais); aqui fica só o detalhe do desconto geral. */}
        <p className="text-sm text-muted-foreground">
          Desconto geral:{' '}
          <output aria-label="Desconto percentual">{formatPercent(percentual)}</output> %
        </p>
      </TabsContent>
      <TabsContent value="impostos">
        <p className="py-6 text-sm text-muted-foreground">
          Aba Totais de Impostos não capturada na transcrição do SoftLux (§10).
        </p>
      </TabsContent>
      <TabsContent value="frete">
        <p className="py-6 text-sm text-muted-foreground">
          Aba Frete não capturada na transcrição do SoftLux (§10).
        </p>
      </TabsContent>
    </Tabs>
  )
}

/** Grade de itens com os totais nas últimas fileiras (DESIGN.md §DocumentoTotais). */
function GradeItens() {
  // A coluna `Tipo de Peça` é um kind do servidor; as demais são tabelas locais
  // que o contrato não expõe como lista de apoio.
  const { options: tiposDePeca } = useLookupOptions('tipoPeca')
  const subtotal = useSubtotalCentavos('itens')
  const modo = useWatch({ name: 'modoDesconto' }) as Orcamento['modoDesconto']
  const percentual = (useWatch({ name: 'descontoPercentual' }) as number) ?? 0
  // Desconto geral incide sobre o subtotal; por produto já saiu na linha.
  const descontoGeral =
    modo === 'GERAL' ? Math.round((subtotal * percentual) / (PERCENT_ESCALA * 100)) : 0

  return (
    <FormGrid
      name="itens"
      hideAdd
      actions={(append) => <BotoesInsercao append={append} />}
      columns={[
        { key: 'item', label: 'Item' },
        { key: 'codigoFornecedor', label: 'Código Fornecedor' },
        { key: 'descricaoFornecedor', label: 'Descrição do Fornecedor' },
        { key: 'ambiente', label: 'Ambiente', type: 'select', options: tabelas.ambientes },
        { key: 'acabamento', label: 'Acabamento', type: 'select', options: tabelas.acabamentos },
        { key: 'tamanho', label: 'Tamanho' },
        { key: 'quantidade', label: 'Quant.' },
        { key: 'unidade', label: 'Und.', type: 'select', options: tabelas.unidades },
        { key: 'valorUnitarioCentavos', label: 'Valor Unit.', type: 'money' },
        { key: 'descontoPercentual', label: 'Desc. %', type: 'percent' },
        {
          key: 'valorItem',
          label: 'Valor Item',
          type: 'computed',
          compute: (row: FormGridRow) => formatMoneyBRL(totalItemCentavos(row)),
        },
        { key: 'grupoProduto', label: 'Grupo Produto' },
        {
          key: 'tipoPeca',
          label: 'Tipo de Peça',
          type: 'select',
          options: tiposDePeca,
        },
        { key: 'fornecedor', label: 'Fornecedor' },
      ]}
      newRow={ITEM_VAZIO}
      totals={{
        valueColumnKey: 'valorItem',
        rows: fileirasTotais(subtotal, [
          { label: 'Desconto', valorCentavos: descontoGeral, sinal: -1 },
        ]),
      }}
    />
  )
}

function AbaPrincipal() {
  return (
    <div className="flex flex-col gap-4">
      <Cabecalho />
      <ControlesDesconto />

      <p className="text-sm text-muted-foreground">
        Tecle {shortcutLabel(SHORTCUTS.imagemProduto)} para mostrar imagem do produto.
      </p>

      <GradeItens />

      <TotaisOrcamento />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => console.info('[mock] Imprimir Orçamento')}
        >
          <FileText className="size-4" /> Orçamento
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => console.info('[mock] Estoque')}
        >
          <Package className="size-4" /> Estoque
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => console.info('[mock] Alterar Limites')}
        >
          Alterar Limites
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => console.info('[mock] Permissões')}
        >
          <Lock className="size-4" /> Permissões
        </Button>
      </div>
    </div>
  )
}

/** Abas superiores não capturadas — §10. */
const ABAS_SEM_CAPTURA = [
  ['servicos', 'Serviços'],
  ['cliente', 'Cliente'],
  ['pagamento', 'Pagamento'],
  ['outrosDados', 'Outros Dados'],
] as const

export function OrcamentoForm({
  orcamento,
  readOnly = false,
}: { orcamento: Orcamento; readOnly?: boolean }) {
  const navigate = useNavigate()

  function onGravar(values: Orcamento) {
    // Mock only: sem backend. Na integração, mutation do TanStack Query.
    console.info('[mock] Gravar orçamento', values)
    void navigate({ to: '/vendas/orcamentos' })
  }

  return (
    <CadastroForm
      schema={orcamentoSchema}
      defaultValues={orcamento}
      onGravar={onGravar}
      onCancelar={() => void navigate({ to: '/vendas/orcamentos' })}
      readOnly={readOnly}
    >
      <Tabs defaultValue="principal">
        <TabsList className="flex-wrap">
          <TabsTrigger value="principal">Principal</TabsTrigger>
          {ABAS_SEM_CAPTURA.map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="principal">
          <AbaPrincipal />
        </TabsContent>
        {ABAS_SEM_CAPTURA.map(([value, label]) => (
          <TabsContent key={value} value={value}>
            <p className="py-6 text-sm text-muted-foreground">
              Aba {label} não capturada na transcrição do SoftLux — aguardando nova rodada de prints
              (transcrição §10).
            </p>
          </TabsContent>
        ))}
      </Tabs>
    </CadastroForm>
  )
}
