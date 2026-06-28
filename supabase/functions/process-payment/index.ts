// AtriosWork Payment Processor - Base Price: 9.90€
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  // 1. Lidar com CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  try {
    // 2. Parse do Corpo da Requisição
    const requestData = await req.json()
    const { token, email, description, vendorCode, discountPercent } = requestData

    console.log(`[ATRIOSWORK-PAY] A receber pedido para: ${email}`)

    if (!token) throw new Error("Token de pagamento não fornecido.")
    if (!email) throw new Error("E-mail do cliente não fornecido.")

    // 3. Variáveis de Ambiente e Limpeza
    const stripeKey = (globalThis as any).Deno.env.get('STRIPE_SECRET_KEY')?.replace(/\s/g, '')
    const supabaseUrl = (globalThis as any).Deno.env.get('SUPABASE_URL')?.trim()
    const supabaseKey = (globalThis as any).Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()

    if (!stripeKey) throw new Error("Configuração ausente: STRIPE_SECRET_KEY não encontrada no servidor.")
    if (!supabaseUrl || !supabaseKey) throw new Error("Configuração ausente: Credenciais Supabase não encontradas.")

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    // 4. Cálculo do Valor Final Dinâmico
    const BASE_PRICE = 9.90
    let finalPrice = BASE_PRICE
    let discountApplied = false

    // PRIORIDADE: Utilizar o desconto enviado pelo checkout (já validado com o parceiro)
    if (discountPercent !== undefined && discountPercent !== null && discountPercent > 0) {
      discountApplied = true
      const discountRate = discountPercent / 100
      finalPrice = BASE_PRICE * (1 - discountRate)
      console.log(`[ATRIOSWORK-PAY] Desconto de ${discountPercent}% aplicado via checkout.`)
    } 
    // FALLBACK: Se não recebeu percentagem mas tem código, tenta localizar no DB
    else if (vendorCode) {
      const code = vendorCode.trim().toUpperCase()
      
      const { data: vData } = await supabaseAdmin
        .from('vendors')
        .select('id')
        .ilike('code', code)
        .maybeSingle();
      
      if (vData) {
        const { data: pData } = await supabaseAdmin
          .from('profiles')
          .select('subscription')
          .eq('id', vData.id)
          .maybeSingle();

        if (pData) {
          discountApplied = true
          let sub: any = {}
          try {
            sub = typeof pData.subscription === 'string' ? JSON.parse(pData.subscription) : (pData.subscription || {})
          } catch (e) { sub = {} }
          
          const dbDiscount = sub.custom_discount ?? 5
          const discountRate = dbDiscount / 100
          finalPrice = BASE_PRICE * (1 - discountRate)
          console.log(`[ATRIOSWORK-PAY] Desconto de ${dbDiscount}% recuperado da DB do parceiro.`)
        } else {
          discountApplied = true
          finalPrice = BASE_PRICE * 0.95
        }
      }
    }

    // O Stripe exige o montante em cêntimos (inteiro positivo)
    const amountCents = Math.round(finalPrice * 100)
    
    if (isNaN(amountCents) || amountCents <= 0) {
      throw new Error(`Montante calculado inválido: ${amountCents}`)
    }

    // 5. Construção dos Parâmetros via URLSearchParams
    const params = new URLSearchParams()
    params.append('amount', amountCents.toString())
    params.append('currency', 'eur')
    params.append('confirm', 'true')
    params.append('payment_method_data[type]', 'card')
    params.append('payment_method_data[card][token]', token)
    params.append('description', description || `Licença AtriosWork Elite - ${email}`)
    params.append('receipt_email', email)
    params.append('off_session', 'true')
    params.append('return_url', 'https://atrioswork.com/success')
    
    // Metadados para auditoria no Stripe Dashboard
    params.append('metadata[vendor_code]', vendorCode || 'DIRETO')
    params.append('metadata[discount_percent]', discountApplied ? (discountPercent || 'DB_SYNC').toString() : '0%')

    console.log(`[ATRIOSWORK-PAY] Montante final: ${amountCents} cêntimos (${finalPrice}€). A contactar Stripe...`)

    // 6. Execução da Chamada à API do Stripe
    const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
      },
      body: params
    })

    const stripeData = await stripeResponse.json()

    if (!stripeResponse.ok) {
      console.error("[ATRIOSWORK-STRIPE-ERROR]:", JSON.stringify(stripeData))
      const errorMessage = stripeData.error?.message || "Erro desconhecido no processamento bancário."
      throw new Error(errorMessage)
    }

    // 7. Resposta de Sucesso ao Frontend
    return new Response(
      JSON.stringify({ 
        success: true, 
        chargeId: stripeData.id, 
        amountCharged: amountCents / 100,
        discounted: discountApplied,
        status: stripeData.status
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 200 
      }
    )

  } catch (error: any) {
    console.error("[ATRIOSWORK-FATAL-ERROR]:", error.message)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: "A AtriosWork não conseguiu processar o pagamento."
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 400 
      }
    )
  }
})
