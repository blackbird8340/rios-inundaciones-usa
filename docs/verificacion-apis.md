# Verificación de APIs (13/10/2026)

Resuelve los pendientes de §14 del brief. Todo probado con consultas reales.

## NWPS — `https://api.water.noaa.gov/nwps/v1/`
- `/gauges/{lid}` trae todo lo que necesitamos para la página de medidor:
  - `flood.categories.{action,minor,moderate,major}.stage` (ft; `flow` = -9999 si no hay)
  - `flood.impacts[]` → `{stage, statement}` (PTTP1 tiene 23)
  - `flood.crests.historic[]` y `flood.crests.recent[]`
  - `status.observed` / `status.forecast` → `primary` (ft), `secondary` (kcfs), `floodCategory`, `validTime`
  - `upstreamLid` / `downstreamLid` → sirve para ordenar medidores aguas arriba→abajo en la página de río
  - `usgsId`, `reachId`, `county`, `state.abbreviation`, `timeZone`, `latitude`, `longitude`, `inService.enabled`
- `/gauges?bbox...` con bbox de todo EE.UU. → **504 tras 60 s**. Pedir por estado (bbox chico).
- Otros endpoints: `/gauges/{id}/stageflow`, `/gauges/{id}/ratings`, `/reaches/{reachId}/streamflow`, `/monitor`.

## USGS OGC — `https://api.waterdata.usgs.gov/ogcapi/v1/`
- Key funciona por header `X-Api-Key`; respuesta trae `x-ratelimit-limit: 1000`, `x-ratelimit-remaining`.
- `latest-continuous/items` acepta `bbox`, `limit`, `offset`, `state_code`, `county_code`, `parameter_code`, `monitoring_location_id`, `filter`, `properties`, `skipGeometry`.
- Una sola llamada `bbox=<PA>&parameter_code=00065&limit=10000` → 529 medidores en 2,5 s. Ingesta de un estado = 1–2 requests.
- Valores vienen como string (`"value": "2.09"`), `approval_status: "Provisional"`.

## RTFI — `https://api.waterdata.usgs.gov/rtfi-api/`
- Docs accesibles: `/rtfi-api/docs` y `/rtfi-api/openapi.json` (200).
- Rutas: `/referencepoints`, `/referencepoints/state/{state_id}`, `/referencepoints/nwis/{nwis_id}`, `/referencepoints/nws/{nws_id}`, `/referencepoints/flooding`, `/referencepoints/geojson?bbox=`, `/referencepoints/count/totals-by-state`, `/states`, `/counties/state/{state_id}`, `/nws_usgs/state/{abbr}` (crosswalk NWS↔USGS).
- `state_id` es el ID interno de RTFI (de `/states`), **no** el FIPS.
- Campos por punto: `site_name`, `rp_name`, `description`, `nws_id`, `nwis_id`, `latitude`, `longitude`, `rp_elevation` (umbral, ft), `gage_height`, `is_flooding`, `active`.
- **Importante:** gran parte de RTFI son los impactos de texto de NWS re-importados (`description` empieza con "Flood Impact Statement from National Weather Service"). Puntos físicos propios:

| Estado | Total RTFI | Copiados de NWS | Propios | Medidores con propios |
|---|---|---|---|---|
| PA | 182 | 0 | 182 | 80 |
| TN | 942 | 942 | 0 | 0 |
| NC | 155 | 105 | 50 | 22 |
| GA | 1243 | 1040 | 203 | 51 |
| TX | 1087 | 1079 | 8 | 2 |
| IN | 743 | 444 | 299 | 246 |
| NY | 852 | 841 | 11 | 6 |
| KY | 449 | 273 | 176 | 110 |
| VA | 31 | 0 | 31 | 10 |
| CO | 442 | 441 | 1 | 1 |

Muchos "propios" son `BANK`/`BFE` (cauce lleno / cota de inundación base), no calles o puentes.

## NWS GIS — `.../water/riv_gauges/MapServer`
- Capa 0 = observado; 1–14 = pronóstico a 24…336 h; 15 = período completo.
- Campos: `gaugelid`, `status`, `waterbody`, `state`, `observed`, `action`, `flood`, `moderate`, `major`, `obstime`, `latitude`, `longitude`, `url`.
- Sirve para conteos y para el mapa (con `outStatistics` + `groupByFieldsForStatistics=state`).

Medidores NWS por estado (capa 0) y cuántos tienen categorías de crecida:

| Estado | Medidores | Con categorías |
|---|---|---|
| NC | 593 | 461 |
| TX | 722 | 454 |
| FL | 809 | 468 |
| VA | 500 | 330 |
| GA | 359 | 324 |
| PA | 355 | 203 |
| IN | 287 | 218 |
| TN | 215 | 116 |

Total EE.UU.: 12.891 medidores NWS, 7.482 con categorías.

## Sin verificar todavía
- Índice de capa de zonas en FEMA NFHL, bucket NWM en AWS, host de NLDI (todo fase 2).
- Cuántos medidores por estado tienen `flood.impacts` en NWPS (requiere 1 request por medidor; hacerlo en la primera ingesta).
