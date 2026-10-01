import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Annotated, Final, Literal

import pyatv
from aiohttp import WSMsgType, web
from pydantic import BaseModel, Field, TypeAdapter, ValidationError
from pyatv.const import InputAction, Protocol
from pyatv.exceptions import ConnectionFailedError, ConnectionLostError
from pyatv.interface import AppleTV

HOST: Final = "127.0.0.1"
PORT: Final = 8765
SCAN_TIMEOUT_SECONDS: Final = 5
IDLE_TIMEOUT_SECONDS: Final = 30 * 60
IDLE_CHECK_INTERVAL_SECONDS: Final = 60

logger = logging.getLogger("atv_server")


class DeviceNotFoundError(Exception):
    pass


class ConnectData(BaseModel):
    address: str
    companion: str = ""
    airplay: str = ""


class ConnectMessage(BaseModel):
    cmd: Literal["connect"]
    data: ConnectData


class KeyMessage(BaseModel):
    cmd: Literal["key"]
    data: str


MESSAGE_ADAPTER: Final = TypeAdapter[ConnectMessage | KeyMessage](
    Annotated[ConnectMessage | KeyMessage, Field(discriminator="cmd")]
)


class DeviceConnection:
    def __init__(self) -> None:
        self.target: ConnectData = ConnectData(address="")
        self.atv: AppleTV | None = None
        self.last_activity: float = asyncio.get_running_loop().time()

    def set_target(self, target: ConnectData) -> None:
        if target != self.target:
            self.close()
            self.target = target

    async def get_device(self) -> AppleTV:
        """RAISES DeviceNotFoundError"""
        if self.atv is not None:
            return self.atv

        loop = asyncio.get_running_loop()
        configs = await pyatv.scan(loop, hosts=[self.target.address], timeout=SCAN_TIMEOUT_SECONDS)
        if not configs:
            raise DeviceNotFoundError(self.target.address)

        config = configs[0]
        if self.target.companion:
            _ = config.set_credentials(Protocol.Companion, self.target.companion)
        if self.target.airplay:
            _ = config.set_credentials(Protocol.AirPlay, self.target.airplay)

        self.atv = await pyatv.connect(config, loop)
        logger.info("Connected to %s", self.target.address)
        return self.atv

    def close(self) -> None:
        if self.atv is not None:
            _ = self.atv.close()
            self.atv = None

    async def send_key(self, key: str) -> None:
        """RAISES DeviceNotFoundError"""
        self.last_activity = asyncio.get_running_loop().time()

        for attempt in range(2):
            atv = await self.get_device()
            remote = atv.remote_control
            actions: dict[str, Callable[[], Awaitable[None]]] = {
                "up": remote.up,
                "down": remote.down,
                "left": remote.left,
                "right": remote.right,
                "select": remote.select,
                "menu": remote.menu,
                "home": remote.home,
                "home_hold": lambda: remote.home(InputAction.Hold),
                "top_menu": remote.top_menu,
                "play_pause": remote.play_pause,
                "skip_forward": remote.skip_forward,
                "skip_backward": remote.skip_backward,
                # Remote keys do not wait for a volume update like atv.audio does
                "volume_up": remote.volume_up,
                "volume_down": remote.volume_down,
            }

            action = actions.get(key)
            if action is None:
                logger.warning("Unknown key: %s", key)
                return

            try:
                await action()
                return
            except (ConnectionLostError, ConnectionFailedError, ConnectionError):
                # Reconnect once when the device dropped the connection
                logger.warning("Connection lost on attempt %d, reconnecting", attempt + 1)
                self.close()


CONNECTION_KEY: Final = web.AppKey("connection", DeviceConnection)


async def handle_socket(request: web.Request) -> web.WebSocketResponse:
    connection = request.app[CONNECTION_KEY]
    socket = web.WebSocketResponse()
    _ = await socket.prepare(request)

    async for raw_message in socket:
        if raw_message.type != WSMsgType.TEXT:
            continue

        try:
            message = MESSAGE_ADAPTER.validate_json(raw_message.data)
        except ValidationError:
            logger.warning("Invalid message: %s", raw_message.data)
            continue

        match message:
            case ConnectMessage():
                connection.set_target(message.data)
            case KeyMessage():
                if not connection.target.address:
                    logger.warning("Key %s received before connect", message.data)
                    continue
                try:
                    await connection.send_key(message.data)
                except DeviceNotFoundError:
                    logger.error("Device not found: %s", connection.target.address)
                except (ConnectionFailedError, ConnectionError):
                    logger.exception("Failed to send key %s", message.data)
                    connection.close()
                except TimeoutError:
                    logger.exception("Timeout sending key %s", message.data)

    return socket


async def main() -> None:
    connection = DeviceConnection()
    app = web.Application()
    app[CONNECTION_KEY] = connection
    _ = app.router.add_get("/", handle_socket)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, HOST, PORT)
    try:
        await site.start()
    except OSError:
        # Another server instance already owns the port
        logger.info("Port %d in use, exiting", PORT)
        await runner.cleanup()
        return

    logger.info("Listening on %s:%d", HOST, PORT)

    # Idle shutdown
    loop = asyncio.get_running_loop()
    while loop.time() - connection.last_activity < IDLE_TIMEOUT_SECONDS:
        await asyncio.sleep(IDLE_CHECK_INTERVAL_SECONDS)

    logger.info("Idle timeout reached, exiting")
    connection.close()
    await runner.cleanup()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    asyncio.run(main())
