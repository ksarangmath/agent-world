import { route, type Route, type Tile } from '../../shared/map/route'

export type RouteRequest = { key: string; from: Tile; to: Tile }
export type RouteReply = { key: string; route: Route }

const scope = self as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<RouteRequest>) => void): void
  postMessage(message: RouteReply): void
}

scope.addEventListener('message', ({ data }) =>
  scope.postMessage({ key: data.key, route: route(data.from, data.to) }),
)
