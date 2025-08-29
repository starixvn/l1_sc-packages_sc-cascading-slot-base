import { Table } from "sc-game-base";

export default class SignInConsumer extends Table.EventConsumers.TableUserSignInConsumer {
    handleSignInSuccess(socketClient, userInfo, userSession) {
        super.handleSignInSuccess(socketClient, userInfo, userSession);

        this.gameData.ingame[userInfo.name].betQueue = [];
    }
}
