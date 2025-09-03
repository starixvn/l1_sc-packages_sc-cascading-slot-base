import { Table } from "sc-game-base";

export default class SignInConsumer extends Table.EventConsumers.TableUserSignInConsumer {
    handleSignInSuccess(socketClient, userInfo, userSession) {
        const inGameData = this.gameData.ingame[userInfo.name];
        if (inGameData?.betProcessing && inGameData?.betQueue?.length > 0) {
            inGameData.betQueue = [];
        }
        super.handleSignInSuccess(socketClient, userInfo, userSession);
    }
}
