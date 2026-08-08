import { parceiro, stubDeParceiros } from '@/test/parceiros'
import { renderRoute } from '@/test/utils'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('tela Orçamento', () => {
  it('listagem mostra orçamentos e usa Cancelar no lugar de Excluir', async () => {
    renderRoute('/vendas/orcamentos')

    expect(await screen.findByText('ANDRÉ BATALHA')).toBeInTheDocument()
    // §8.1: orçamento não se apaga, se cancela.
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Margem de Lucro' })).toBeInTheDocument()
  })

  it('abre registro existente com os itens e o total calculado', async () => {
    renderRoute('/vendas/orcamentos/2')

    expect(await screen.findByLabelText('Código')).toHaveValue('21654')
    // Item mockado: 2 × R$ 470,00 = R$ 940,00.
    expect(screen.getByLabelText('Valor Item linha 1')).toHaveTextContent('940,00')
    expect(screen.getByLabelText('Total')).toHaveTextContent('940,00')
  })

  it('inserir item pelo botão Produto soma no total', async () => {
    const { user } = renderRoute('/vendas/orcamentos/novo')

    await screen.findByLabelText('Código')
    expect(screen.getByLabelText('Total')).toHaveTextContent('0,00')

    await user.click(screen.getByRole('button', { name: /Produto \(Alt\+P\)/ }))

    await user.type(await screen.findByLabelText('Quant. linha 1'), '3')
    await user.type(screen.getByLabelText('Valor Unit. linha 1'), '10000')

    // 3 × R$ 100,00 = R$ 300,00
    await waitFor(() => {
      expect(screen.getByLabelText('Valor Item linha 1')).toHaveTextContent('300,00')
    })
    expect(screen.getByLabelText('Total')).toHaveTextContent('300,00')
  })

  it('desconto por linha reduz o valor do item', async () => {
    const { user } = renderRoute('/vendas/orcamentos/novo')

    await screen.findByLabelText('Código')
    await user.click(screen.getByRole('button', { name: /Produto \(Alt\+P\)/ }))

    await user.type(await screen.findByLabelText('Quant. linha 1'), '1')
    await user.type(screen.getByLabelText('Valor Unit. linha 1'), '20000')
    // Percentual tem 4 casas implícitas: digitar 100000 = 10,0000 %.
    await user.type(screen.getByLabelText('Desc. % linha 1'), '100000')

    await waitFor(() => {
      expect(screen.getByLabelText('Desc. % linha 1')).toHaveValue('10,0000')
    })
    expect(screen.getByLabelText('Valor Item linha 1')).toHaveTextContent('180,00')
  })

  it('ambiente entra na linha inserida pelo botão Ambiente', async () => {
    const { user } = renderRoute('/vendas/orcamentos/novo')

    await screen.findByLabelText('Código')
    await user.click(screen.getByRole('button', { name: /Ambiente \(Alt\+A\)/ }))

    expect(await screen.findByLabelText('Ambiente linha 1')).toHaveValue('SALA')
  })

  it('busca de cliente preenche o campo e grava', async () => {
    // A janela de busca lê `GET /api/partners?role=customer` — a mesma fronteira
    // da listagem de Clientes.
    const { router, user } = renderRoute(
      '/vendas/orcamentos/novo',
      stubDeParceiros([parceiro({ code: 'C001', legalName: 'ANDRÉ BATALHA', isCustomer: true })]),
    )

    await screen.findByLabelText('Código')
    await user.click(screen.getByRole('button', { name: 'Cliente' }))

    // A janela exige marcar a linha e confirmar em Selecionar.
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByText('ANDRÉ BATALHA'))
    await user.click(within(dialog).getByRole('button', { name: 'Selecionar' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Cliente', { selector: 'input' })).toHaveValue('ANDRÉ BATALHA')
    })

    await user.click(screen.getByRole('button', { name: /Gravar/ }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/vendas/orcamentos')
    })
  })

  // `Profissional Externo` é `[busca +...]` na transcrição (§8.2) contra o
  // MESMO cadastro de `/cadastros/profissionais` — não a categoria genérica
  // "Profissional" que o Cliente usa (§5). Trocado nesta sessão de
  // `LookupSelectField` pra `SearchDialog` de verdade; mapa em
  // `topicos/frente-visual.md` §@mapa-softlux.
  it('busca de profissional externo preenche o campo com a PESSOA, não uma categoria', async () => {
    const { user } = renderRoute(
      '/vendas/orcamentos/novo',
      stubDeParceiros([
        parceiro({ code: 'P001', legalName: 'ARQ. CAMILA SODRÉ', isProfessional: true }),
      ]),
    )

    await screen.findByLabelText('Código')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Busca de Profissional Externo')
    await user.click(await within(dialog).findByText('ARQ. CAMILA SODRÉ'))
    await user.click(within(dialog).getByRole('button', { name: 'Selecionar' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Profissional Externo', { selector: 'input' })).toHaveValue(
        'ARQ. CAMILA SODRÉ',
      )
    })
  })
})
