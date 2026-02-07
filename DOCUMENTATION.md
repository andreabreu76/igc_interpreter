# IGC Interpreter - Documentação Técnica Completa

## Sobre o Projeto

**IGC Interpreter** é um laboratório de análise e visualização de arquivos IGC (formato padrão para registro de voos de parapente e asa-delta). Este projeto serve como modelo e aprendizado para o desenvolvimento de um sistema de gamificação de voos para pilotos.

**Stack Tecnológico:**
- Backend: Node.js + Express
- Frontend: HTML/CSS/JavaScript vanilla
- Bibliotecas: igc-parser, igc-xc-score, Chart.js, Leaflet
- Geocoding: Nominatim (OpenStreetMap)

---

## Cronologia de Desenvolvimento

### Fase 1: Estrutura Básica (Commits 1-5)
- **5c3aa64**: Criação inicial do projeto
- **0a8007c**: Configuração do gitignore
- **604b10f**: Adição do resumo de voo com estatísticas
- **9b513ec**: Validação de dados
- **f1bc59a**: Script de desenvolvimento com nodemon

### Fase 2: Visualização de Dados (Commits 6-15)
- **d322b25**: Informações do piloto e posições de voo
- **902b584**: Gráfico interativo com animação
- **aa42e9c - 01cbf7e**: Melhorias na animação e visualização
- **ad35e38 - b96c4eb**: Refinamentos visuais
- **eddefc0**: Envio de todos os fixes (não apenas 100)

### Fase 3: Mapa Interativo (Commits 16-27)
- **1ffd4ea**: Integração com OpenStreetMap/Leaflet
- **472a38f - 0671195**: Correções de renderização e velocidade
- **fff553b**: Geocodificação reversa
- **1f3a153**: Data e nome do arquivo
- **9704886 - 3cf3669**: Melhorias no mapa e popups

### Fase 4: XC Scoring (Commits 28-34)
- **70f0cd1**: Cálculo de scores XC
- **4be4f9c**: Display de scores
- **995dfc9 - b6804d8**: Implementação com multiplicadores customizados
- **204c0e3 - a9b5bf7**: Configuração e otimizações

### Fase 5: Visualização Avançada (Commits 35-42)
- **f8318df**: Visualização do triângulo XC no mapa
- **cf7e5ee**: Tabela de otimização
- **5596ed2**: Múltiplos gráficos (Altitude, Velocidade, Vario)

---

## Formato IGC - Estrutura de Dados

### O que é um arquivo IGC?

Arquivo IGC é o formato padrão internacional para registro de voos livres (parapente, asa-delta, planador). Contém:
- Coordenadas GPS (latitude, longitude)
- Altitudes (GPS e barométrica)
- Timestamps UTC
- Metadados (piloto, planador, data)

### Exemplo de Linhas IGC:
```
HFDTE150125      # Data: 15/01/2025
HFPLTPILOTINCHARGE:John Doe
HFGTYGLIDERTYPE:Ozone Zeno
B1207223455123S04610456WA004650046500000  # Fix GPS
```

### Parsing do IGC

Utilizamos a biblioteca **igc-parser** que retorna:

```javascript
{
  pilot: string,
  copilot: string,
  gliderType: string,
  registration: string,
  callsign: string,
  date: Date,
  fixes: [{
    timestamp: Date,
    latitude: number,
    longitude: number,
    gpsAltitude: number,
    pressureAltitude: number,
    valid: boolean
  }],
  task: {...}
}
```

---

## Features e Recursos Implementados

### 1. Upload e Parsing de IGC

**Arquivo:** `server.js` (linhas 11-84)

**Funcionalidade:**
- Upload via drag & drop ou clique
- Validação de formato .igc
- Parsing com igc-parser
- Validação de fixes válidos

**Código-chave:**
```javascript
const igcData = IGCParser.parse(fileContent);
if (!igcData.fixes || igcData.fixes.length === 0) {
  return res.status(400).json({ error: 'No GPS fixes found' });
}
```

---

### 2. Resumo de Voo (Flight Summary)

**Arquivo:** `server.js` (função calculateFlightSummary, linhas 104-181)

#### 2.1 Dados Calculados

##### Distância Total
Usa **fórmula de Haversine** para calcular distância entre dois pontos na superfície da Terra:

```javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distância em km
}
```

**Aplicação:**
```javascript
for (let i = 1; i < fixes.length; i++) {
  const distance = haversineDistance(
    fixes[i-1].latitude, fixes[i-1].longitude,
    fixes[i].latitude, fixes[i].longitude
  );
  totalDistance += distance;
}
```

##### Velocidade Máxima
```javascript
const timeDiff = (new Date(fix.timestamp) - new Date(prevFix.timestamp)) / 1000;
const speed = (distance / timeDiff) * 3600; // km/h
if (speed > maxSpeed && speed < 300) maxSpeed = speed; // Filtro de valores absurdos
```

##### Ganho de Altitude
```javascript
const altDiff = alt - (prevFix.gpsAltitude || 0);
if (altDiff > 0) totalClimb += altDiff;
```

##### Duração do Voo
```javascript
function calculateDuration(fixes) {
  const start = new Date(fixes[0].timestamp);
  const end = new Date(fixes[fixes.length - 1].timestamp);
  return Math.round((end - start) / 1000 / 60); // minutos
}
```

#### 2.2 Dados Extraídos

**Do IGC:**
- Piloto
- Tipo de planador
- Data do voo
- Total de fixes GPS
- Posição inicial (lat/lon/timestamp)
- Posição final (lat/lon/timestamp)
- Altitude máxima
- Altitude mínima

**Calculados:**
- Distância total percorrida
- Velocidade máxima
- Tempo de voo
- Ganho de altitude total

---

### 3. Geocodificação Reversa

**Arquivo:** `public/index.html` (função reverseGeocode, linha ~1362)

**API:** Nominatim (OpenStreetMap)

**Funcionalidade:**
- Converte coordenadas GPS em endereços legíveis
- Rate limiting: 1 requisição/segundo (1100ms delay)
- Headers: User-Agent customizado

**Código:**
```javascript
const response = await fetch(
  `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
  { headers: { 'User-Agent': 'IGC-Interpreter/1.0' } }
);
```

**Tratamento de Resposta:**
- Extrai: rua, bairro, cidade
- Fallback: coordenadas se API falhar
- Delay de 1.1s entre decolagem e pouso

---

### 4. XC Scoring (Cross-Country Scoring)

**Arquivo:** `server.js` (linhas 23-72)

#### 4.1 Biblioteca igc-xc-score

Usa algoritmo de **branch-and-bound** para otimização linear:
- Complexidade: O(n²log³(n)) em média
- Encontra solução ótima usando apenas pontos do tracklog
- Não interpola pontos

#### 4.2 Tipos de Voo Calculados

| Tipo | Multiplicador | Descrição |
|------|--------------|-----------|
| Free Flight | 1.5 | Voo livre entre 3 turnpoints |
| Free Triangle | 1.75 | Triângulo com até 20% de abertura |
| FAI Triangle | 2.0 | Triângulo com lados >= 28% |

**Configuração:** `.env`
```env
XC_FREE_FLIGHT_MULTIPLIER=1.5
XC_FREE_TRIANGLE_MULTIPLIER=1.75
XC_FAI_TRIANGLE_MULTIPLIER=2.0
XC_FREE_TRIANGLE_CLOSING=0.15
```

#### 4.3 Algoritmo de Scoring

```javascript
const { solver } = await import('igc-xc-score');

// Regras customizadas
const customXContestRules = [
  {
    name: "Free Flight",
    multiplier: 1.5,
    cardinality: 3,
    code: "od"
  },
  {
    name: "Free Triangle",
    multiplier: 1.75,
    closingDistanceRelative: 0.15, // 15% de tolerância
    cardinality: 3,
    code: "tri"
  },
  // ...
];

const best = solver(igcData, customXContestRules);
```

#### 4.4 Cálculo de Score

```javascript
// Para cada tipo de voo
const distanceKm = scoreInfo.distance; // já em km
const recalculatedScore = distanceKm * multiplier;

// Exemplo: Free Triangle com 18.25 km
// Score = 18.25 * 1.75 = 31.9375 pontos
```

#### 4.5 Dados Retornados

```javascript
{
  score: 31.94,           // Melhor score
  distance: 18.25,        // Distância em km
  type: "Free Triangle",  // Tipo de voo
  multiplier: 1.75,       // Fator aplicado
  turnpoints: [           // Vértices do triângulo
    { lat, lng, fixIndex },
    { lat, lng, fixIndex },
    { lat, lng, fixIndex }
  ],
  closingPoints: {        // Pontos de fechamento
    in: { lat, lng },
    out: { lat, lng }
  },
  types: {                // Todos os tipos calculados
    od: { name, score, distance },
    tri: { name, score, distance },
    fai: { name, score, distance }
  }
}
```

#### 4.6 Precisão vs XContest Oficial

**Diferença:** ~1% (aproximação de 0.15 em closingDistanceRelative)

**Exemplo:**
- XContest: 18.069 km → 31.621 pontos
- Nossa calc: 18.250 km → 31.938 pontos
- Erro: 181 metros (1.00%)

---

### 5. Gráficos Interativos

**Arquivo:** `public/index.html`

#### 5.1 Gráfico de Altitude

**Biblioteca:** Chart.js

**Datasets:**
1. **Ground** (solo estimado)
   ```javascript
   const ground = altitudesGPS.map((alt, i) => {
     const baseGround = Math.max(0, minAlt - range * 0.1);
     const variation = Math.sin(i / fixes.length * Math.PI * 3) * (range * 0.05);
     return baseGround + variation;
   });
   ```

2. **Altitude Barométrica**
   ```javascript
   fixes.map(f => f.pressureAltitude || f.gpsAltitude || 0)
   ```

3. **Altitude GPS**
   ```javascript
   fixes.map(f => f.gpsAltitude || 0)
   ```

4. **Marcador de Posição Atual** (animação)
   ```javascript
   // Atualizado a cada 2ms (velocidade 25x)
   markerData[currentIndex] = altitudes[currentIndex];
   ```

**Animação:**
- Velocidade: 25x (intervalo de 2ms)
- Sincronizada com mapa
- Atualização sem re-render completo: `update('none')`

#### 5.2 Gráfico de Velocidade

**Cálculo:**
```javascript
const speeds = [];
for (let i = 1; i < fixes.length; i++) {
  const distance = calculateDistance(
    fixes[i-1].latitude, fixes[i-1].longitude,
    fixes[i].latitude, fixes[i].longitude
  );
  const timeDiff = (new Date(fixes[i].timestamp) - new Date(fixes[i-1].timestamp)) / 1000;
  const speed = timeDiff > 0 ? (distance / timeDiff) * 3.6 : 0; // km/h
  speeds.push(Math.min(speed, 200)); // Limita a 200 km/h
}
```

**Estilo:**
- Cor: #4ec9b0 (verde-água)
- borderWidth: 1
- tension: 0.4 (suave)

#### 5.3 Gráfico de Vario

**Cálculo:**
```javascript
const varios = [];
for (let i = 1; i < fixes.length; i++) {
  const altDiff = (fixes[i].gpsAltitude || 0) - (fixes[i-1].gpsAltitude || 0);
  const timeDiff = (new Date(fixes[i].timestamp) - new Date(fixes[i-1].timestamp)) / 1000;
  const vario = timeDiff > 0 ? altDiff / timeDiff : 0; // m/s
  varios.push(Math.max(-10, Math.min(10, vario))); // Limita entre -10 e 10 m/s
}
```

**Estilo:**
- Linha: #ce9178 (marrom)
- Fill: Verde (subindo) / Vermelho (descendo)
- Opacidade: 0.2

---

### 6. Mapa Interativo

**Arquivo:** `public/index.html`

**Biblioteca:** Leaflet + OpenStreetMap

#### 6.1 Camadas do Mapa

1. **Trajeto do Voo**
   ```javascript
   const pathCoords = fixes.map(f => [f.latitude, f.longitude]);
   L.polyline(pathCoords, {
     color: '#E74C3C',  // Vermelho
     weight: 3,
     opacity: 0.7
   }).addTo(map);
   ```

2. **Triângulo XC**
   ```javascript
   const triangleCoords = turnpoints.map(tp => [tp.lat, tp.lng]);
   L.polygon(triangleCoords, {
     color: '#9b59b6',      // Roxo
     weight: 2,
     opacity: 0.8,
     fillOpacity: 0.1,
     dashArray: '5, 10'     // Linha tracejada
   }).addTo(map);
   ```

3. **Marcadores**
   - Decolagem: Verde (#4ec9b0)
   - Pouso: Vermelho (#dc3545)
   - Turnpoints: Roxo (#9b59b6)
   - Posição atual (animação): Amarelo (#ffc107)

#### 6.2 Animação Sincronizada

```javascript
// Atualiza marcador sem recriá-lo
currentMarker.setLatLng([fix.latitude, fix.longitude]);
currentMarker.setPopupContent(popupContent);
if (!currentMarker.isPopupOpen()) {
  currentMarker.openPopup();
}

// Atualiza mapa
updateMapMarker(currentIndex);
```

**Velocidade:** 25x (2ms por fix)

#### 6.3 Popup Informativo

```javascript
const popupContent = `
  <b>Posição ${currentIndex + 1}/${fixes.length}</b><br>
  Alt: ${fix.gpsAltitude}m<br>
  ${fix.timestamp}
`;
```

#### 6.4 Fit Bounds Button

```javascript
L.Control.FitBounds = L.Control.extend({
  onAdd: function(map) {
    const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control');
    btn.innerHTML = '';
    btn.onclick = function() {
      map.fitBounds(flightPath.getBounds(), { padding: [50, 50] });
    };
    return btn;
  }
});
```

---

## Arquitetura do Sistema

### Backend (server.js)

```
┌─────────────────────────────────────────┐
│         Express Server (Port 3000)       │
└─────────────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
┌───▼────┐   ┌──────▼──────┐   ┌──▼────┐
│ Static │   │ POST /upload│   │  IGC  │
│ Files  │   │   Multer    │   │Parser │
└────────┘   └──────┬──────┘   └───────┘
                    │
         ┌──────────┼──────────┐
         │          │          │
    ┌────▼───┐ ┌───▼────┐ ┌──▼────────┐
    │Summary │ │XC Score│ │  Geocode  │
    │Calc    │ │Solver  │ │ (Client)  │
    └────────┘ └────────┘ └───────────┘
```

### Frontend (index.html)

```
┌──────────────────────────────────────────┐
│         Upload Interface                  │
│  (Drag & Drop / Click to Upload)         │
└───────────────┬──────────────────────────┘
                │
        ┌───────┼───────┐
        │       │       │
   ┌────▼───┐ ┌▼────┐ ┌▼──────┐
   │Summary │ │Score│ │ Map   │
   │Display │ │Table│ │Leaflet│
   └────────┘ └─────┘ └───┬───┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         ┌────▼───┐  ┌─────▼────┐  ┌───▼────┐
         │Altitude│  │Velocidade│  │ Vario  │
         │Chart   │  │ Chart    │  │ Chart  │
         └────────┘  └──────────┘  └────────┘
                     Chart.js
```

---

## Fórmulas e Algoritmos

### 1. Distância Haversine

```
a = sin²(Δφ/2) + cos φ₁ ⋅ cos φ₂ ⋅ sin²(Δλ/2)
c = 2 ⋅ atan2(√a, √(1−a))
d = R ⋅ c
```

Onde:
- φ = latitude em radianos
- λ = longitude em radianos
- R = 6371 km (raio da Terra)

### 2. Velocidade

```
v = (d / Δt) × 3.6
```

Onde:
- d = distância em km
- Δt = tempo em segundos
- 3.6 = conversão m/s para km/h

### 3. Vario (Taxa de Subida/Descida)

```
vario = Δh / Δt
```

Onde:
- Δh = diferença de altitude em metros
- Δt = diferença de tempo em segundos
- Resultado em m/s

### 4. XC Score

```
Score = Distância × Multiplicador
```

Multiplicadores:
- Free Flight: 1.5
- Free Triangle: 1.75
- FAI Triangle: 2.0

---

## Dependências

### Backend (package.json)

```json
{
  "dependencies": {
    "express": "^5.2.1",
    "igc-parser": "^2.0.0",
    "igc-xc-score": "^1.8.0",
    "multer": "^2.0.2",
    "dotenv": "^17.2.4"
  },
  "devDependencies": {
    "nodemon": "^3.1.11"
  }
}
```

### Frontend (CDN)

- Chart.js 4.4.1
- Leaflet 1.9.4
- OpenStreetMap tiles

---

## Configuração (.env)

```env
# Multiplicadores XContest
XC_FREE_FLIGHT_MULTIPLIER=1.5
XC_FREE_TRIANGLE_MULTIPLIER=1.75
XC_FAI_TRIANGLE_MULTIPLIER=2.0

# Tolerância de fechamento do triângulo
# Valor ideal: 0.15 (15%) para aproximar do XContest
# Menor = mais restrito
# Maior = mais flexível
XC_FREE_TRIANGLE_CLOSING=0.15
```

---

## Performance

### Otimizações Implementadas

1. **Animação:**
   - `update('none')` no Chart.js (sem re-render completo)
   - Intervalo fixo de 2ms

2. **Geocoding:**
   - Rate limiting: 1.1s delay
   - Caching implícito do navegador (15min)

3. **Mapas:**
   - `invalidateSize()` antes de `fitBounds()`
   - Reutilização de marcador (não recria)

4. **Gráficos:**
   - `animation: false` no Chart.js
   - `pointRadius: 0` (sem pontos)
   - Apenas 1 dataset animado

---

## Casos de Uso para Gamificação

### 1. Sistema de Pontuação

**Extraído do IGC:**
- XC Score (Free Flight, Triangles)
- Distância total
- Altitude máxima
- Ganho de altitude
- Duração do voo

**Possíveis Scores:**
- Pontos por km voado
- Pontos por altitude ganho
- Bônus por triangles FAI
- Multiplicadores por tipo de voo

### 2. Conquistas/Badges

**Baseado em:**
- Primeira vez voando X km
- Primeiro triângulo FAI
- Altitude máxima pessoal
- Voo mais longo
- Melhor vario médio

### 3. Rankings

**Métricas Disponíveis:**
- XC Score total
- Melhor voo (distância/score)
- Total de voos
- Horas de voo
- Locais voados (via geocoding)

### 4. Análise Temporal

**Dados Extraíveis:**
- Timestamp de cada fix
- Duração por fase (subida/planeio/descida)
- Horário de decolagem/pouso
- Tempo em térmica vs transição

### 5. Comparação Social

**Dados Compartilháveis:**
- Trajeto no mapa
- Gráficos de altitude/velocidade/vario
- Estatísticas do voo
- Triângulo XC otimizado

---

## Limitações Conhecidas

### 1. XC Scoring

- **Diferença de ~1%** vs XContest oficial
- Motivo: algoritmo de otimização diferente
- Solução: ajuste de `closingDistanceRelative`

### 2. Geocoding

- **Rate limit:** 1 req/segundo
- **Dependência:** API externa (Nominatim)
- **Solução:** delay de 1.1s entre requisições

### 3. Performance

- **Voos muito longos** (>10h, >50k fixes):
  - Gráficos podem ficar lentos
  - Solução futura: downsampling

### 4. Altitude Barométrica

- **Nem todos os IGC têm**
- Fallback: usa GPS altitude
- Pode afetar precisão do vario

---

## Próximos Passos Sugeridos

### Para Gamificação

1. **Backend persistente:**
   - Banco de dados (PostgreSQL/MongoDB)
   - Armazenamento de voos
   - Sistema de usuários

2. **Análise avançada:**
   - Detecção de térmicas
   - Eficiência de planeio
   - Comparação com modelos teóricos

3. **Social:**
   - Feed de voos
   - Comentários
   - Compartilhamento

4. **Desafios:**
   - Objetivos semanais
   - Competições
   - Ligas

### Melhorias Técnicas

1. **Caching:**
   - Redis para geocoding
   - Cache de cálculos XC

2. **Processamento:**
   - Queue para uploads
   - Workers para cálculos pesados

3. **Real-time:**
   - WebSockets para live tracking
   - Notificações

---

## Aprendizados Técnicos

### 1. Parsing de IGC

- Biblioteca igc-parser é robusta
- Validação de fixes é crucial
- Timestamps são sempre UTC

### 2. Cálculos Geográficos

- Haversine é suficiente para distâncias curtas (<500km)
- WGS84 vs outros sistemas
- Precisão GPS ~5-10m

### 3. XC Scoring

- Algoritmo de branch-and-bound é complexo
- Multiplicadores fazem grande diferença
- Parâmetros de fechamento são críticos

### 4. Visualização

- Chart.js performa bem até ~10k pontos
- Leaflet é leve e rápido
- Animação sincronizada requer cuidado

### 5. UX

- Dark theme é preferido por pilotos
- Gráficos empilhados > abas
- Informação visual > números

---

## Conclusão

O **IGC Interpreter** é um laboratório funcional que demonstra:

1. **Parsing completo** de arquivos IGC
2. **Cálculos precisos** de distância, velocidade, vario
3. **XC Scoring** com ~1% de precisão vs XContest
4. **Visualizações interativas** (gráficos + mapa)
5. **Geocoding** de posições
6. **Animação sincronizada** entre gráfico e mapa

**Tecnicamente pronto** para servir como base para um sistema de gamificação de voos, com todos os dados necessários sendo extraídos e calculados corretamente.

**Próximo passo:** Definir regras de gamificação e implementar backend persistente.

---

**Desenvolvido como laboratório para aprendizado**
**Tempo de desenvolvimento:** ~5 horas
**Commits:** 42
**Linhas de código:** ~1500

---

*Última atualização: 2025-02-06*
