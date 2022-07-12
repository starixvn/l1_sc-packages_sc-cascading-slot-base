import CascadingGameCron from "../cascading-game-cron";
import { Crons, EventConsumers } from "sc-slot-game-base";
import { stub, stubMongoose } from "jest-micro-auto-stub";
import { FreeSpinsConsumer, TotalMultiplierConsumer } from "../../event-consumers";
import { CascadingBoardGenerator } from "../../board";
import { logger } from "sc-common";
import mongoose from "mongoose";
import cron from "cron";
import Chance from "chance";
import { when } from "jest-when";

jest.mock("cron");
jest.mock("sc-common");
const chance = new Chance();

describe("gameCron", () => {
    const definition = {
        durations: {
            wholeRound: 60,
        },
    };
    const gameData = {
        roundId: chance.natural(),
        gameConfigs: {
            cascadingSlotsConfig: {},
        },
    };
    const bot = stub(Crons.SlotGameBot);
    const settleGameRoundConsumer = stub(EventConsumers.SettleGameRoundConsumer);
    const freeSpinsConsumer = stub(FreeSpinsConsumer);
    const idCountersConsumer = stub(EventConsumers.IdCountersConsumer);
    const gameStatusPublisher = {};
    const runningRoundInfoPublisher = {};
    const gameConfigsRepository = stubMongoose(mongoose.Model);
    const roundsRepository = stubMongoose(mongoose.Model);
    const currencyGroupGamesRepository = stubMongoose(mongoose.Model);
    const currencyGroupRepository = stubMongoose(mongoose.Model);
    const currencyRepository = stubMongoose(mongoose.Model);
    const archiveStatusesRepository = stubMongoose(mongoose.Model);
    const notificationRepository = stubMongoose(mongoose.Model);
    const exchangeRatesRepository = stubMongoose(mongoose.Model);
    const partnerConfigRepository = stubMongoose(mongoose.Model);
    const totalMultiplierConsumer = stub(TotalMultiplierConsumer);
    const boardGenerator = stub(CascadingBoardGenerator);

    let gameCron;

    beforeEach(() => {
        gameCron = new CascadingGameCron({
            definition,
            gameData,
            bot,
            settleGameRoundConsumer,
            freeSpinsConsumer,
            idCountersConsumer,
            gameStatusPublisher,
            runningRoundInfoPublisher,
            logService: logger,
            gameConfigsRepository,
            roundsRepository,
            archiveStatusesRepository,
            notificationRepository,
            exchangeRatesRepository,
            currencyGroupGamesRepository,
            currencyGroupRepository,
            partnerConfigRepository,
            currencyRepository,
            totalMultiplierConsumer,
            boardGenerator,
        });
    });

    it("should extend SlotGameCron", () => {
        // Assert
        expect(gameCron instanceof Crons.SlotGameCron);
    });

    describe("start", () => {
        beforeEach(() => {
            gameCron.loadUnsettledBetsToIngame = jest.fn();
            gameCron.getSettingForNewRound = jest.fn();
            gameCron.updateExchangeRates = jest.fn();
            gameCron.getLastArchiveRound = jest.fn();
        });

        it("should get latest round id", async () => {
            // Act
            await gameCron.start();

            // Assert
            expect(idCountersConsumer.getLatestId).toBeCalledWith("round");
        });

        it("should get latest free spin id", async () => {
            // Act
            await gameCron.start();

            // Assert
            expect(idCountersConsumer.getLatestId).toBeCalledWith("freespin");
        });

        describe("when having no game round id and free spin id", () => {
            const roundId = chance.natural();
            const freeSpinId = chance.natural();

            beforeEach(() => {
                when(idCountersConsumer.getLatestId).calledWith("round").mockReturnValueOnce(0);
                when(idCountersConsumer.getLatestId).calledWith("freespin").mockReturnValueOnce(0);
                gameCron.getLastArchiveRound = jest.fn().mockResolvedValueOnce({ roundId, freeSpinId });
            });

            it("should get last archive round", async () => {
                // Act
                await gameCron.start();

                // Assert
                expect(gameCron.getLastArchiveRound).toBeCalledWith();
            });

            it("should update latest round id", async () => {
                // Act
                await gameCron.start();

                // Assert
                expect(idCountersConsumer.updateLatestId).toBeCalledWith("round", roundId);
            });

            it("should update latest free spin id", async () => {
                // Act
                await gameCron.start();

                // Assert
                expect(idCountersConsumer.updateLatestId).toBeCalledWith("freespin", freeSpinId);
            });

            it("should log error", async () => {
                // Act
                await gameCron.start();

                // Assert
                expect(logger.logError).toBeCalledWith(`${definition.name} get roundId #${roundId} and freeSpinId #${freeSpinId} from archive.`);
            });
        });

        it("should load unsettle bet to ingame", async () => {
            // Act
            await gameCron.start();

            // Assert
            expect(gameCron.loadUnsettledBetsToIngame).toBeCalled();
        });

        it("should reload free spin", async () => {
            // Act
            await gameCron.start();

            // Assert
            expect(freeSpinsConsumer.reload).toBeCalled();
        });

        it("should reload total multiplier", async () => {
            // Act
            await gameCron.start();

            // Assert
            expect(totalMultiplierConsumer.reload).toBeCalled();
        });

        it("should call boardGenerator.initialize", async () => {
            // Act
            await gameCron.start();

            // Assert
            expect(boardGenerator.initialize).toBeCalled();
        });

        it("should call initTrialMode", async () => {
            // Arrange
            gameCron.initTrialMode = jest.fn();

            // Act
            await gameCron.start();

            // Assert
            expect(gameCron.initTrialMode).toBeCalled();
        });

        it("should get setting for new round", async () => {
            // Act
            await gameCron.start();

            // Assert
            expect(gameCron.getSettingForNewRound).toBeCalled();
        });

        it("should update exchange rates", async () => {
            // Act
            await gameCron.start();

            // Assert
            expect(gameCron.updateExchangeRates).toBeCalled();
        });

        describe("start cron job", () => {
            describe("cronTime", () => {
                it("should be every second", async () => {
                    // Arrange
                    cron.CronJob = jest.fn(() => {
                        return { start: jest.fn() };
                    });

                    // Act
                    await gameCron.start();

                    // Assert
                    expect(cron.CronJob.mock.calls[0][0]).toBe("* * * * * *");
                });
            });

            describe("onStick", () => {
                it("should call proceed", async () => {
                    // Arrange
                    cron.CronJob = jest.fn(() => {
                        return { start: jest.fn() };
                    });
                    gameCron.proceed = jest.fn(() => {
                        return { catch: jest.fn() };
                    });

                    // Act
                    await gameCron.start();
                    cron.CronJob.mock.calls[0][1]();

                    // Assert
                    expect(gameCron.proceed).toHaveBeenCalledWith();
                });

                it("should call catch", async () => {
                    // Arrange
                    cron.CronJob = jest.fn(() => {
                        return { start: jest.fn() };
                    });
                    const catchFunc = jest.fn();
                    gameCron.proceed = jest.fn(() => {
                        return { catch: catchFunc };
                    });

                    // Act
                    await gameCron.start();
                    cron.CronJob.mock.calls[0][1]();

                    // Assert
                    expect(catchFunc).toHaveBeenCalledWith(gameCron.logService.logError);
                });
            });

            describe("onComplete", () => {
                it("should log error", async () => {
                    // Arrange
                    const startFunc = jest.fn();
                    cron.CronJob = jest.fn(() => {
                        return { start: startFunc };
                    });
                    definition.name = "name 1";

                    // Act
                    await gameCron.start();
                    cron.CronJob.mock.calls[0][2]();

                    // Assert
                    expect(logger.logError).toHaveBeenCalledWith(
                        `name 1 unexpectedly stopped at round #${gameData.roundId} because some other tasks halt it.`
                    );
                });

                it("should call start job", async () => {
                    // Arrange
                    const startFunc = jest.fn();
                    cron.CronJob = jest.fn(() => {
                        return { start: startFunc };
                    });
                    gameCron.logService.logError = jest.fn();
                    gameCron.definition.name = "name 1";
                    gameCron.gameData.roundId = 12;

                    // Act
                    await gameCron.start();
                    cron.CronJob.mock.calls[0][2]();

                    // Assert
                    expect(startFunc).toHaveBeenCalledTimes(2);
                });
            });
        });
    });

    describe("proceed", () => {
        beforeEach(() => {
            gameCron.checkGameStatus = jest.fn();
        });

        describe("when remaining time is equal to whole round", () => {
            beforeEach(() => {
                gameData.remainingTime = definition.durations.wholeRound;
            });

            it("should call checkGameStatus", async () => {
                // Act
                await gameCron.proceed();

                // Assert
                expect(gameCron.checkGameStatus).toBeCalled();
            });

            describe("when having bot", () => {
                it("should reset bot", async () => {
                    // Act
                    await gameCron.proceed();

                    // Assert
                    expect(bot.reset).toBeCalled();
                });
            });
        });

        describe("when game is not disabled", () => {
            it("should decrease remaining time", async () => {
                // Arrange
                gameData.remainingTime = 5;

                // Act
                await gameCron.proceed();

                // Assert
                expect(gameData.remainingTime).toBe(4);
            });

            describe("when having bot", () => {
                it("should call bot.run", async () => {
                    // Act
                    await gameCron.proceed();

                    // Assert
                    expect(bot.run).toBeCalled();
                });
            });
        });

        describe("when remaining time is less than 0", () => {
            beforeEach(() => {
                gameData.remainingTime = -1;
            });

            it("should set remaining time to whole round time", async () => {
                // Act
                await gameCron.proceed();

                // Assert
                expect(gameData.remainingTime).toBe(definition.durations.wholeRound);
            });

            it("should reload free spin", async () => {
                // Act
                await gameCron.proceed();

                // Assert
                expect(freeSpinsConsumer.reload).toBeCalled();
            });

            it("should reload total multiplier", async () => {
                // Act
                await gameCron.proceed();

                // Assert
                expect(totalMultiplierConsumer.reload).toBeCalled();
            });
        });
    });

    afterAll(() => {
        jest.clearAllMocks();
    });
});
