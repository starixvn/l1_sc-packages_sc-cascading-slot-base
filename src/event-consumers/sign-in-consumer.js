import { Table } from "sc-game-base";

export default class SignInConsumer extends Table.EventConsumers.TableUserSignInConsumer {
    handleSignInSuccess(socketClient, userInfo, userSession) {
        const inGameData = this.gameData.ingame[userInfo.name];
        if (inGameData?.betProcessing && inGameData?.betQueue?.length > 0) {
            const processTimeOut = 50;
            const keepHandleSignIn = () => {
                if (inGameData.betProcessing) {
                    setTimeout(keepHandleSignIn, processTimeOut);
                } else {
                    inGameData.betQueue = [];
                    super.handleSignInSuccess(socketClient, userInfo, userSession);
                }
            };
            setTimeout(keepHandleSignIn, processTimeOut);
        } else {
            super.handleSignInSuccess(socketClient, userInfo, userSession);
        }
    }
}
