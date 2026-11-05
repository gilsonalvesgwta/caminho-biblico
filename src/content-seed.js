import { db, now } from './db.js';

/** Conteúdo inicial do desafio, extraído do Roteiro Mestre. Tudo é editável no painel. */
const DAYS = [
  {
    number: 1, block: 'Coração', title: 'Dinheiro é espiritual', subtitle: 'Oração de propósito para os 7 dias',
    objective: 'Sair convencido de que dinheiro é assunto de coração e de princípio, não só de renda, e com o Raio-X da sua vida financeira preenchido.',
    video_duration: '18 min', practice_duration: '15 min', activity_key: 'd1',
    key_phrases: ['Não é sobre quanto você ganha. É sobre quem governa o que você ganha.', 'Se ganhar mais resolvesse, 7 em cada 10 famílias que ganham mais de 10 salários não estariam endividadas.', 'Prosperar não é pecado. Pecado é deixar o dinheiro ocupar o lugar de Deus.'],
    verses: [{ ref: 'Lucas 16:11', text: 'Pois, se nas riquezas injustas não fostes fiéis, quem vos confiará as verdadeiras?' }, { ref: 'Deuteronômio 8:18', text: 'É Deus quem dá a força para adquirir riqueza.' }],
    release_message: 'Olá, [nome]! O seu desafio começa hoje. 🔥\nDia 1: Dinheiro é espiritual. Uma aula de 18 minutos que vai mudar a forma como você enxerga o seu dinheiro.\nDepois da aula, faça o seu Raio-X (15 minutos). É o ponto de partida de tudo.\nAcesse aqui: [link]\nAmanhã: o altar do coração.',
    tomorrow: 'Amanhã vou te mostrar que todo coração tem um altar. E a pergunta é: quem está sentado nele?',
  },
  {
    number: 2, block: 'Coração', title: 'O altar do coração', subtitle: 'E o senhorio de Deus',
    objective: 'Identificar quem ocupa o altar do seu coração, entender que tudo pertence a Deus e registrar os seus custos fixos.',
    video_duration: '18 min', practice_duration: '15 min', activity_key: 'd2',
    key_phrases: ['O foco do inimigo não é a sua conta bancária. É o seu coração.', 'Deus nos deu domínio sobre a terra, mas nunca sobre o ouro e a prata.', 'Até uma bênção pode ocupar o lugar de quem abençoa.'],
    verses: [{ ref: 'Provérbios 4:23', text: 'Sobre tudo o que se deve guardar, guarda o teu coração, porque dele procedem as fontes da vida.' }, { ref: 'Mateus 6:21', text: 'Porque onde estiver o vosso tesouro, aí estará também o vosso coração.' }, { ref: 'Salmos 37:4', text: 'Deleita-te também no Senhor, e ele te concederá os desejos do teu coração.' }, { ref: 'Ageu 2:8', text: 'Minha é a prata, e meu é o ouro, disse o Senhor dos Exércitos.' }],
    release_message: '[nome], Dia 2 liberado!\nO altar do coração. Três perguntas simples que revelam quem realmente governa o seu dinheiro.\nDepois da aula, responda as perguntas do altar e liste seus custos fixos (15 minutos).\nAcesse aqui: [link]\nAmanhã: o maior inimigo das suas finanças.',
    tomorrow: 'E qual o motivo de Deus nunca ter nos dado domínio sobre o ouro e a prata? Amanhã você vai conhecer o maior inimigo das suas finanças.',
  },
  {
    number: 3, block: 'Coração', title: 'Mamom: o maior inimigo das suas finanças', subtitle: 'Quem é, como atua, as armas, os frutos e como quebrar a influência',
    objective: 'Entender quem é Mamom e como ele atua, reconhecer as armas e os frutos dele na própria vida, trocar as mentiras pela verdade e sair com um propósito definido com Deus.',
    video_duration: '50 min (2 partes)', practice_duration: '15 min', activity_key: 'd3',
    key_phrases: ['Jesus deu nome ao rival do seu coração na área financeira: Mamom.', 'Você pode amar a Deus e, mesmo assim, viver nas garras de Mamom.', 'Quem te mantém na escassez é Mamom, não Jesus.', 'Quando Deus permite uma batalha, Ele é o maior interessado na sua vitória.'],
    verses: [{ ref: 'Mateus 6:24', text: 'Ninguém pode servir a dois senhores… Não podeis servir a Deus e a Mamom.' }, { ref: 'Efésios 6:12', text: 'Porque não temos que lutar contra a carne e o sangue, mas, sim, contra os principados, contra as potestades…' }, { ref: 'Lucas 16:10', text: 'Quem é fiel no mínimo, também é fiel no muito.' }, { ref: 'Mateus 2:11', text: '…e abrindo os seus tesouros, ofertaram-lhe dádivas: ouro, incenso e mirra.' }],
    release_message: '[nome], Dia 3 liberado!\nHoje você vai conhecer o maior inimigo das suas finanças: quem ele é, as armas que ele usa, os frutos que ele deixa e como quebrar a influência dele.\nNo fim da aula tem uma oração. Reserve um momento tranquilo.\nAcesse aqui: [link]\nAmanhã: o primeiro princípio, a base de todos os outros.',
    tomorrow: 'Amanhã você vai conhecer o primeiro princípio, a base de todos os outros. E vai entender por que a matemática do Reino de Deus é diferente da nossa.',
  },
  {
    number: 4, block: 'Princípios', title: 'Mordomia e a matemática do Reino', subtitle: 'Recado para quem tem dívidas e as 3 fases financeiras',
    objective: 'Entender o primeiro princípio (tudo é de Deus, eu sou mordomo), ver a matemática do Reino na história da viúva, descobrir quanto sobra de verdade e em qual fase financeira você está.',
    video_duration: '28 min', practice_duration: '15 min', activity_key: 'd4',
    key_phrases: ['Só vive as promessas quem honra e vive os princípios.', 'O mordomo desfruta de tudo, mas não é dono de nada.', 'Na transferência ocorre a multiplicação.', 'A matemática do Reino de Deus é diferente da nossa.'],
    verses: [{ ref: 'Lucas 12:42', text: 'Qual é, pois, o mordomo fiel e prudente, a quem o senhor pôs sobre os seus servos…?' }, { ref: 'Provérbios 22:7', text: 'O rico domina sobre os pobres, e o que toma emprestado é servo do que empresta.' }, { ref: '2 Reis 4:7', text: 'Vai, vende o azeite, e paga a tua dívida; e tu e teus filhos vivei do resto.' }],
    release_message: '[nome], Dia 4 liberado!\nHoje você vai conhecer o primeiro princípio, a base de todos os outros, e a matemática do Reino de Deus, que é diferente da nossa.\nNa atividade, você descobre quanto realmente sobra no seu mês. Tenha o extrato e a fatura do cartão em mãos.\nAcesse aqui: [link]\nAmanhã: o único princípio que Deus te convida a colocar à prova.',
    tomorrow: 'Amanhã vamos falar de um princípio que Deus diz que podemos colocar à prova. É o único lugar da Bíblia em que Ele faz esse convite.',
  },
  {
    number: 5, block: 'Princípios', title: 'Dízimo: o princípio que Deus convida a colocar à prova', subtitle: 'Repreender o devorador e consagrar os 90%',
    objective: 'Entender o que é o dízimo, o poder dele (repelir o devorador e consagrar os 90%), por que entregá-lo com o coração e como a primeira coisa, e colocá-lo como a primeira linha do orçamento.',
    video_duration: '25 min', practice_duration: '10 min', activity_key: 'd5',
    key_phrases: ['O 100% entra, eu devolvo 10% e consagro os outros 90%.', 'Tudo é consagrado a alguém, você querendo ou não.', 'Dízimo não é o que sobra. É a primeira coisa.'],
    verses: [{ ref: 'Malaquias 3:10', text: 'Trazei todos os dízimos à casa do tesouro… e depois fazei prova de mim nisto, diz o Senhor dos Exércitos.' }, { ref: 'Malaquias 3:11', text: 'E por causa de vós repreenderei o devorador, e ele não destruirá os frutos da vossa terra.' }, { ref: 'Levítico 27:30', text: 'Todas as dízimas… são do Senhor; santas são ao Senhor.' }],
    release_message: '[nome], Dia 5 liberado!\nHoje você vai conhecer o único princípio em que Deus diz: "fazei prova de mim". E vai entender por que ele tem o poder de consagrar tudo o que chega até você.\nAcesse aqui: [link]\nAmanhã: o detalhe que fez Deus aceitar a oferta de Abel e não a de Caim.',
    tomorrow: 'Amanhã você vai entender por que Deus aceitou a oferta de Abel e não a de Caim. A diferença está num detalhe que quase ninguém repara.',
  },
  {
    number: 6, block: 'Princípios', title: 'Primícias, ofertas e generosidade', subtitle: 'Como viver os princípios na prática',
    objective: 'Entender as primícias e as ofertas, desenvolver um coração generoso, juntar todos os princípios num jeito prático de viver e ver a sua Casa em Ordem montada.',
    video_duration: '25 min', practice_duration: '15 min', activity_key: 'd6',
    key_phrases: ['Caim ofereceu um fruto. Abel ofereceu o primeiro.', 'A oferta é a verdade que quebra as mentiras de Mamom.', 'Não há nada de errado em prosperar. Só não podemos perder o coração.'],
    verses: [{ ref: 'Provérbios 3:9-10', text: 'Honra ao Senhor com os teus bens, e com a primeira parte de todos os teus ganhos; e se encherão os teus celeiros…' }, { ref: '2 Coríntios 9:7', text: 'Deus ama ao que dá com alegria.' }, { ref: 'Provérbios 11:25', text: 'A alma generosa prosperará.' }],
    release_message: '[nome], Dia 6 liberado!\nPor que Deus aceitou a oferta de Abel e não a de Caim? Hoje você vai descobrir o detalhe que quase ninguém repara e ver a sua Casa em Ordem montada.\nAcesse aqui: [link]\nAmanhã é o último dia, e eu tenho um convite especial pra você.',
    tomorrow: 'Amanhã é o último dia. Você já colocou o coração no lugar e honrou os princípios. Agora vou te mostrar como sair do princípio para o patrimônio. E no final, eu tenho um convite especial pra você.',
  },
  {
    number: 7, block: 'Patrimônio', title: 'Do princípio ao patrimônio', subtitle: 'Sonhos, crédito como ferramenta e autoquitação',
    objective: 'Entender que Deus te chama a multiplicar, definir os seus sonhos com valor e prazo, diferenciar renda de patrimônio e dívida de crédito, montar o seu Plano de Patrimônio e comparar o antes e o depois.',
    video_duration: '28 min', practice_duration: '20 min', activity_key: 'd7',
    key_phrases: ['Mordomia não é só guardar bem. É multiplicar o que Deus confiou.', 'Renda é o que você recebe. Patrimônio é o que trabalha por você.', 'A dívida de consumo escraviza. O crédito inteligente constrói.'],
    verses: [{ ref: 'Mateus 25:21', text: 'Bem está, servo bom e fiel. Sobre o pouco foste fiel, sobre muito te colocarei.' }, { ref: 'Provérbios 13:22', text: 'O homem de bem deixa uma herança aos filhos de seus filhos.' }],
    release_message: '[nome], chegamos ao último dia!\nHoje você vai montar o seu Plano de Patrimônio, comparar o seu antes e depois destes 7 dias e receber um convite especial meu.\nAcesse aqui: [link]\nEstou muito feliz que você chegou até aqui.',
    tomorrow: '',
  },
];

export function seedContent() {
  if (db.get('SELECT COUNT(*) c FROM products').c > 0) return;
  const t = now();
  db.tx(() => {
    const p = db.run(`INSERT INTO products (slug, name, kind, tagline, description, release_mode, release_delay_hours, materials, position, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      'desafio-7-dias', 'O Caminho Bíblico do Dinheiro: Desafio de 7 Dias', 'challenge',
      'Em 7 dias, descubra o que está travando a sua prosperidade e saia com a sua casa financeira em ordem pelos princípios bíblicos.',
      'Coração (Dias 1–3, onde estou) · Princípios (Dias 4–6, honra) · Patrimônio (Dia 7, para onde vou).',
      'after_complete', 24, '[]', 1, t, t);
    const pid = Number(p.lastInsertRowid);
    for (const d of DAYS) {
      db.run(`INSERT INTO lessons (product_id, number, block, title, subtitle, objective, video_duration, practice_duration, key_phrases, verses, activity_key, release_offset, release_message, tomorrow, published, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
        pid, d.number, d.block, d.title, d.subtitle, d.objective, d.video_duration, d.practice_duration,
        JSON.stringify(d.key_phrases), JSON.stringify(d.verses), d.activity_key, d.number - 1, d.release_message, d.tomorrow, t, t);
    }
    db.run(`INSERT INTO products (slug, name, kind, tagline, description, release_mode, materials, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      'guia-casa-em-ordem', 'Guia rápido: Casa em Ordem', 'bonus',
      'Cortes, teto de gastos variáveis, horário do dinheiro e fórmula da reserva.',
      'Bônus / order bump do desafio.', 'open', JSON.stringify([{ title: 'Guia rápido: Casa em Ordem (PDF)', url: '' }]), 2, t, t);
  });
  console.log('[seed] conteúdo inicial do desafio criado');
}
