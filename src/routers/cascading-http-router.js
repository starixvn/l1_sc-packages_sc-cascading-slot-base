import { utils } from "sc-common";
import { Core } from "sc-game-base";
import defaultDefinition from "../board/default-definition";

export default class CascadingHttpRouter extends Core.Routers.HttpRouter {
    constructor(appConfigs, gameData, tumbleCalculator, boardGenerator, logService, historyQuery, metricQuery) {
        super(appConfigs, gameData, historyQuery, metricQuery, logService);

        this.tumbleCalculator = tumbleCalculator;
        this.boardGenerator = boardGenerator;
    }

    init(app) {
        super.init(app);

        app.post(
            "/api/set-result",
            utils.authentication.useAuthenticate({
                authUrl: this.appConfigs.apiSettings.authUrl,
                audiences: this.appConfigs.authenticateSettings.audiences,
            }),
            (_req, res) => this.handleSetBoard(_req.body, res)
        );
    }

    handleSetBoard(params, res) {
        try {
            if (this.appConfigs.sentry.env !== "PROD") {
                if (!params || !params.name || !params.result) {
                    this.logService.logError("receives a result cheating call with invalid params.");
                    res.send({ error: true });

                    return;
                }

                this.logService.logWarning(`receives a result cheating call for ${params?.name} with the board as ${params.result}.`);

                const preGeneratedResult = this.generateResultFromAdmin(params.result);
                this.gameData.settlementResultFromAdmin[params.name] = preGeneratedResult;

                res.send(
                    preGeneratedResult.map((x) => ({
                        icons: Object.entries(x.icons).map(([key, value]) => ({
                            index: parseInt(key),
                            ...value,
                        })),
                        multipliers: x.multipliers,
                        board: x.newBoard,
                        freeSpinCount: x.newBoard.filter((symbol) => symbol === defaultDefinition.specialSymbols.freeSpins).length,
                    }))
                );
            } else {
                res.send({ noPermission: true });
            }
        } catch (error) {
            this.logService.logError(error);
            res.send({ error: true });
        }
    }

    generateResultFromAdmin(result) {
        const { cascadingSlotsConfig } = this.gameData.gameConfigs;
        const { base, tumbles } = result;
        const firstTumble = {
            newBoard: base.board,
            multipliers: base.multipliers,
            icons: this.tumbleCalculator.calculateIconOdds(base.board, cascadingSlotsConfig),
        };
        const boardGenerator = this.boardGenerator.initialize();
        const preGeneratedResult = [firstTumble];

        for (const tumble of tumbles) {
            const lastTumble = preGeneratedResult[preGeneratedResult.length - 1];
            boardGenerator.setRefillSymbols(tumble.newSymbols, tumble.multipliers);

            const refilledResult = boardGenerator.explodeAndRefill(
                lastTumble.newBoard,
                Object.keys(lastTumble.icons).map((x) => parseInt(x)),
                lastTumble.multipliers
            );

            refilledResult.icons = this.tumbleCalculator.calculateIconOdds(refilledResult.newBoard, cascadingSlotsConfig);
            preGeneratedResult.push(refilledResult);
        }

        return preGeneratedResult;
    }
}
