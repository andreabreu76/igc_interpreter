# Plano: Hike and Fly Detection

## Contexto

Detectar automaticamente tracklogs de Hike and Fly, separar as fases (hike vs voo) e apresentar estatisticas independentes para cada fase. Baseado nas especificacoes do Jesse (juiz de prova de competicao H&F).

## Logica de Deteccao

### Classificacao do tracklog

1. Primeiro fix em voo → voo tradicional, processar normalmente
2. Primeiro fix no chao, dentro do raio de decolagem conhecida → voo tradicional, descartar parte no chao
3. Primeiro fix no chao, fora de decolagem conhecida → Hike and Fly, separar em hike + voo

### Criterio chao vs voo

- Threshold principal: **20 metros AGL** (ajustado com base nos testes - ver secao de resultados)
- O Jesse sugeriu 2m, porem a precisao do SRTM/ASTER (30m resolucao) introduz erro de +/-15m
- Abaixo do threshold por mais de 5 segundos → no chao
- Excecao (proximity flying): abaixo do threshold mas velocidade > 20 km/h → em voo
- Velocidade sozinha NAO serve como criterio (vento de cara pode reduzir ground speed a 5 km/h em voo)

### Separacao do tracklog

- Dividir o tracklog original em dois arrays: fixes de hike + fixes de voo
- Piloto pode alternar entre chao e voo (pouso intermediario)
- Tudo que for chao → concatena no tracklog hike
- Tudo que for voo → concatena no tracklog voo

## Altitude Sobre o Terreno (AGL) - Resultados dos Testes

### APIs testadas (2026-03-12)

| API | Status | Tempo resposta | Notas |
|-----|--------|----------------|-------|
| Open-Elevation | TIMEOUT | >15s | Instavel, sem resposta |
| OpenTopoData (SRTM 30m) | OK | ~960ms/100pts | Funcional, dados coerentes |
| OpenTopoData (ASTER 30m) | OK | similar | Funcional, elevacoes ligeiramente menores |
| Google Elevation | Nao testado | - | Fallback pago |

### Decisao: OpenTopoData com dataset SRTM 30m

Motivos:
- Resposta rapida (~1s para 100 pontos)
- Dados coerentes com GPS altitude do IGC
- API gratuita, possibilidade de self-host via Docker
- SRTM 30m mostrou melhor correlacao com GPS que ASTER

### Limites da API publica

- Max 100 locations por request
- Max 1 call por segundo
- Max 1000 calls por dia

### Estrategia de amostragem

Para um tracklog de ~9000 fixes (2.5h):

| Amostragem | API calls | Tempo estimado |
|------------|-----------|----------------|
| Cada fix (1s) | 90 calls | 90s |
| Cada 5s | 18 calls | 18s |
| Cada 10s | 9 calls | 9s |
| Cada 30s | 3 calls | 3s |

Recomendacao: **amostrar a cada 10 segundos** (9 calls, ~9s). Para deteccao de transicao chao/voo, 10s de resolucao e suficiente.

### Comparacao GPS vs Terreno (IGC do Jesse - 2023-11-12)

```
Time       | GPS Alt | SRTM 30m | ASTER 30m | AGL(SRTM) | AGL(ASTER) | Fase
-----------|---------|----------|-----------|-----------|------------|------
11:58:33   |      26 |       19 |        10 |         7 |        16  | hike (inicio)
12:06:53   |      31 |       30 |        18 |         1 |        13  | hike
12:15:13   |      56 |       52 |        43 |         4 |        13  | hike
12:31:53   |     209 |      214 |       207 |        -5 |         2  | hike
12:48:33   |     369 |      377 |       365 |        -8 |         4  | hike
13:05:13   |     504 |      502 |       501 |         2 |         3  | hike
13:21:53   |     664 |      672 |       672 |        -8 |        -8  | hike
13:38:33   |     830 |      834 |       830 |        -4 |         0  | hike
13:55:13   |     877 |      866 |       855 |        11 |        22  | hike (topo)
14:11:53   |     877 |      859 |       851 |        18 |        26  | decolagem
14:20:13   |     571 |       67 |        47 |       504 |       524  | voo
14:27:56   |      25 |       19 |        10 |         6 |        15  | pouso
```

Conclusao: AGL durante hike fica entre -8 e +18m (erro GPS/SRTM). Em voo, AGL salta para 500m+. Threshold de 20m AGL separa as fases sem ambiguidade.

## Metricas

### Hike

| Metrica | Descricao |
|---------|-----------|
| Duracao | Tempo total caminhando |
| Distancia total | Km percorridos na trilha (soma dos segmentos) |
| Distancia em linha reta | Do primeiro ao ultimo ponto do hike |
| Velocidade media | km/h |
| Velocidade maxima | km/h |
| Pace | min/km |
| Ganho de altitude | Desnivel positivo acumulado |

### Totais (hike + voo combinados)

| Metrica | Descricao |
|---------|-----------|
| Duracao total | Soma das duracoes ou do tracklog original |
| Distancia em linha reta | Primeiro ponto ao ultimo ponto do tracklog |
| Velocidade media geral | Distancia total / duracao total |

### Voo

Metricas ja existentes no sistema, sem alteracao.

## UI

### Mapa

- Manter o tracklog de voo como esta (vermelho)
- Adicionar tracklog de hike em outra cor
- Toggle para ligar/desligar camada de hike
- Marcadores de inicio/fim de cada fase

### Paineis de estatisticas

Ordem de exibicao:
1. Bloco de voo (ja existe)
2. Bloco de hike (novo)
3. Bloco de totais (novo)

### Graficos

- Avaliar se faz sentido incluir graficos do hike (altitude, velocidade) ou se as estatisticas bastam para o MVP

## Decisoes

- Formato aceito: somente IGC (sem GPX por enquanto)
- Performance: processamento rapido para tracklogs de ate 5 horas
- Tracklogs acima de 5h podem ser mais lentos, usuarios ja esperam isso
- Lista de decolagens conhecidas: a definir (pode ser um JSON local ou consulta ao banco)
- API de elevacao: OpenTopoData SRTM 30m (public API, com possibilidade de self-host)
- Threshold AGL: 20m (ajustavel com mais testes)
- Amostragem: a cada 10 segundos

## Fases de Implementacao

### Fase 1 - Fundacao [em andamento]
- [x] Testar APIs de elevacao com IGCs reais
- [x] Escolher API (OpenTopoData SRTM 30m)
- [x] Validar threshold AGL
- [ ] Implementar modulo de consulta de elevacao no server.js
- [ ] Implementar logica de separacao chao vs voo

### Fase 2 - Separacao e metricas
- [ ] Separar tracklog em hike + voo
- [ ] Calcular metricas do hike
- [ ] Calcular metricas totais
- [ ] Retornar dados separados na API

### Fase 3 - UI
- [ ] Exibir tracklog do hike no mapa com cor diferente
- [ ] Painel de estatisticas do hike
- [ ] Painel de totais
- [ ] Toggle de camada hike no mapa

### Fase 4 - Refinamento
- [ ] Integrar lista de decolagens conhecidas
- [ ] Ajustar thresholds com base em mais testes reais
- [ ] Tratar edge cases (proximity flying, pousos intermediarios)
- [ ] Considerar self-host do OpenTopoData para producao
