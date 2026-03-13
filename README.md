# IGC Interpreter

Aplicacao Node.js para interpretar arquivos IGC (International Gliding Commission) e visualizar dados de voo livre.

## Uso

```bash
npm install
npm start
```

Acesse http://localhost:3000

## Funcionalidades

- Upload de arquivos IGC via drag & drop ou selecao de arquivo
- Parsing completo do tracklog com todos os fixes GPS
- Resumo do voo: distancia, duracao, altitude max/min, velocidade max, ganho de altitude
- Score XC com multiplicadores configuraveis (Free Flight, Free Triangle, FAI Triangle)
- Deteccao de Hike and Fly com elevacao do terreno via OpenTopoData API
- Classificacao de cada fix como `hike` ou `fly` baseado em AGL e velocidade
- Cache local de elevacao para evitar consultas repetidas a API
- Streaming de fases do processamento em tempo real durante o upload
- Mapa interativo (Leaflet) com layers toggleaveis: caminhada, triangulo XC, ascendencia, descendencia
- Graficos de altitude (GPS + barometrica + terreno), velocidade e vario
- Animacao do voo no mapa com marcador de posicao atual
- JSON completo do resultado com botao de copia

## Configuracao

Variaveis de ambiente (`.env`):

```
PORT=3000
XC_FREE_FLIGHT_MULTIPLIER=1.5
XC_FREE_TRIANGLE_MULTIPLIER=1.75
XC_FAI_TRIANGLE_MULTIPLIER=2.0
XC_FREE_TRIANGLE_CLOSING=0.15
```

## Stack

- Node.js + Express
- igc-parser (parsing IGC)
- igc-xc-score (calculo XC)
- OpenTopoData API (elevacao do terreno)
- Leaflet (mapa)
- Chart.js (graficos)
- HTML/CSS/JS vanilla (frontend)
