import Chance from "chance";
import { GameConfig, UserInfo, UserSession } from "jest-auto-fixture/src/models";
import { stub } from "jest-micro-auto-stub";
import { helpers } from "sc-common";
import { Core } from "sc-game-base";
import { PlaceBetConsumer } from "../index";

describe("PlaceBetConsumer", () => {
    const chance = new Chance();
    const baseEventPublisher = stub(Core.BaseEventPublisher);
    const durations = {
        wholeRound: 61,
        placingBets: 50,
        lockingBet: 5,
    };

    let definition;
    let consumer;
    let player;
    let payload;
    let gameData;

    function initGameData() {
        const defaultGameData = new Core.GameData();
        defaultGameData.remainingTime = 20;
        defaultGameData.gameConfigs = GameConfig();
        defaultGameData.gameConfigs.cascadingSlotsConfig = { betLevels: [] };
        defaultGameData.currencyGroupGames = [
            {
                groupId: "1",
                coinValues: [1, 10, 100],
                defaultCoinValue: 1,
            },
            {
                groupId: "2",
                coinValues: [],
                defaultCoinValue: undefined,
            },
        ];

        return defaultGameData;
    }

    function mockPlayer() {
        const userInfo = UserInfo();
        const userSession = UserSession();

        return {
            UID: userInfo.UID,
            profile: { ...userInfo },
            session: { ...userSession, currencyGroupId: "1" },
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        gameData = initGameData();
        definition = new Core.GameDefinition({ id: 1, name: "game name", durations }, jest.fn(), jest.fn());

        consumer = new PlaceBetConsumer(definition, gameData, baseEventPublisher);

        player = mockPlayer();
        payload = {
            betLevel: chance.natural(),
            coinValue: chance.natural(),
            freeSpin: chance.bool(),
            roundId: chance.natural(),
        };
    });

    it("inherit Core.BaseEventConsumers.PlaceBetConsumer", () => {
        // Assert
        expect(consumer instanceof Core.BaseEventConsumers.PlaceBetConsumer);
    });

    describe("consume", () => {
        describe("when validateBetRequest failed", () => {
            it("should not add bet to queue", () => {
                // Arrange
                jest.spyOn(consumer, "validateBetRequest").mockReturnValueOnce(false);
                payload.freeSpin = undefined;
                payload.roundId = undefined;
                const expectedValue = {};

                // Act
                consumer.consume(player, payload);

                // Assert
                expect(gameData.ingame).toStrictEqual(expectedValue);
            });
        });

        describe("when validateBetRequest pass", () => {
            describe("when not ingame yet", () => {
                it("should add bet to queue", () => {
                    // Arrange
                    jest.spyOn(consumer, "validateBetRequest").mockReturnValueOnce(true);
                    payload.freeSpin = true;
                    payload.roundId = 1;
                    const expectedValue = [{ player, payload }];

                    // Act
                    consumer.consume(player, payload);

                    // Assert
                    expect(gameData.ingame[player.profile.name].betQueue).toStrictEqual(expectedValue);
                });
            });

            describe("when already ingame", () => {
                it("should add bet to queue", () => {
                    // Arrange
                    jest.spyOn(consumer, "validateBetRequest").mockReturnValueOnce(true);
                    gameData.ingame = { [player.profile.name]: { betQueue: [] } };
                    const expectedValue = [{ player, payload }];

                    // Act
                    consumer.consume(player, payload);

                    // Assert
                    expect(gameData.ingame[player.profile.name].betQueue).toStrictEqual(expectedValue);
                });
            });
        });
    });

    describe("validateBetRequest", () => {
        describe("when free spin", () => {
            beforeEach(() => {
                // Arrange
                payload.freeSpin = true;
            });

            describe("when have failed validation", () => {
                beforeEach(() => {
                    // Arrange
                    payload.betLevel = null;
                    payload.coinValue = null;
                    jest.spyOn(consumer, "composeValidationCriteria").mockReturnValueOnce([{ failure: true, notice: "SB1935" }]);
                });

                it("should return false", () => {
                    // Act
                    const actualValue = consumer.validateBetRequest(player, payload);

                    // Assert
                    expect(actualValue).toBe(false);
                });

                it("should publish failed event", () => {
                    // Act
                    consumer.validateBetRequest(player, payload);

                    // Assert
                    expect(baseEventPublisher.publishToUser).toHaveBeenCalledWith(player.UID, { endBet: -1, notice: "SB1935" });
                });
            });

            describe("when not have failed validation", () => {
                it("should return true", () => {
                    // Arrange
                    payload.betLevel = 10;
                    payload.coinValue = 2;
                    jest.spyOn(consumer, "composeValidationCriteria").mockReturnValueOnce([{ failure: false, notice: "SB1935" }]);

                    // Act
                    const actualValue = consumer.validateBetRequest(player, payload);

                    // Assert
                    expect(actualValue).toBe(true);
                });
            });
        });

        describe("when not free spin", () => {
            beforeEach(() => {
                // Arrange
                payload.freeSpin = false;
            });

            describe("when payload not have bet level", () => {
                it("should return false", () => {
                    // Arrange
                    payload.betLevel = null;

                    // Act
                    const actualValue = consumer.validateBetRequest(player, payload);

                    // Assert
                    expect(actualValue).toBe(false);
                });
            });

            describe("when payload not have coin value", () => {
                it("should return false", () => {
                    // Arrange
                    payload.betLevel = 10;
                    payload.coinValue = null;

                    // Act
                    const actualValue = consumer.validateBetRequest(player, payload);

                    // Assert
                    expect(actualValue).toBe(false);
                });
            });

            describe("when have failed validation", () => {
                beforeEach(() => {
                    // Arrange
                    payload.betLevel = 10;
                    payload.coinValue = 2;
                    jest.spyOn(consumer, "composeValidationCriteria").mockReturnValueOnce([{ failure: true, notice: "SB1935" }]);
                });

                it("should return false", () => {
                    // Act
                    const actualValue = consumer.validateBetRequest(player, payload);

                    // Assert
                    expect(actualValue).toBe(false);
                });

                it("should publish failed event", () => {
                    // Act
                    consumer.validateBetRequest(player, payload);

                    // Assert
                    expect(baseEventPublisher.publishToUser).toHaveBeenCalledWith(player.UID, { endBet: -1, notice: "SB1935" });
                });
            });

            describe("when not have failed validation", () => {
                it("should return true", () => {
                    // Arrange
                    payload.betLevel = 10;
                    payload.coinValue = 2;
                    jest.spyOn(consumer, "composeValidationCriteria").mockReturnValueOnce([{ failure: false, notice: "SB1935" }]);

                    // Act
                    const actualValue = consumer.validateBetRequest(player, payload);

                    // Assert
                    expect(actualValue).toBe(true);
                });
            });
        });
    });

    describe("composeValidationCriteria", () => {
        it("should return combination of composeBettingTimeValidationCriteria and composeBetAmountValidationCriteria", () => {
            // Arrange
            jest.spyOn(consumer, "composeBettingTimeValidationCriteria").mockReturnValueOnce([{ failure: false, notice: "SB1935" }]);
            jest.spyOn(consumer, "composeBetAmountValidationCriteria").mockReturnValueOnce([{ failure: true, notice: "SB1936" }]);
            const expectedValue = [
                { failure: false, notice: "SB1935" },
                { failure: true, notice: "SB1936" },
            ];

            // Act
            const actualValue = consumer.composeValidationCriteria(player, payload);

            // Assert
            expect(actualValue).toStrictEqual(expectedValue);
        });
    });

    describe("composeBettingTimeValidationCriteria", () => {
        describe("when game disabled", () => {
            it("should return result with failure", () => {
                // Arrange
                gameData.gameConfigs.enabled = false;
                const expectedValue = [{ failure: true, notice: { errorCode: "SB1935" } }];

                // Act
                const actualValue = consumer.composeBettingTimeValidationCriteria();

                // Assert
                expect(actualValue).toStrictEqual(expectedValue);
            });
        });

        describe("when game enabled", () => {
            it("should return result with not failure", () => {
                // Arrange
                gameData.gameConfigs.enabled = true;
                const expectedValue = [{ failure: false, notice: { errorCode: helpers.noticeHelper.invalidBet } }];

                // Act
                const actualValue = consumer.composeBettingTimeValidationCriteria();

                // Assert
                expect(actualValue).toStrictEqual(expectedValue);
            });
        });
    });

    describe("composeBetAmountValidationCriteria", () => {
        describe("when free spin", () => {
            describe("when bet level is invalid", () => {
                it("should return result with not failure", () => {
                    // Arrange
                    const expectedValue = { failure: false, notice: { errorCode: helpers.noticeHelper.invalidBet } };
                    player.session.currencyGroupId = "3";
                    gameData.gameConfigs.cascadingSlotsConfig.betLevels = [];
                    payload.betLevel = 2;
                    payload.freeSpin = true;

                    // Act
                    const actualValue = consumer.composeBetAmountValidationCriteria(player, payload);

                    // Assert
                    expect(actualValue[0]).toStrictEqual(expectedValue);
                });
            });

            describe("when bet level is valid", () => {
                it("should return result with not failure", () => {
                    // Arrange
                    const expectedValue = { failure: true, notice: { errorCode: helpers.noticeHelper.invalidBet } };
                    player.session.currencyGroupId = "1";
                    gameData.gameConfigs.cascadingSlotsConfig.betLevels = [1, 5, 10];
                    payload.betLevel = 5;
                    payload.freeSpin = true;
                    payload.buyFreeSpin = true;

                    // Act
                    const actualValue = consumer.composeBetAmountValidationCriteria(player, payload);

                    // Assert
                    expect(actualValue[1]).toStrictEqual(expectedValue);
                });
            });

            describe("when coin value is invalid", () => {
                it("should return result with not failure", () => {
                    // Arrange
                    const expectedValue = { failure: false, notice: { errorCode: helpers.noticeHelper.invalidBet } };
                    payload.coinValue = 2;
                    payload.freeSpin = true;

                    // Act
                    const actualValue = consumer.composeBetAmountValidationCriteria(player, payload);

                    // Assert
                    expect(actualValue[2]).toStrictEqual(expectedValue);
                });
            });

            describe("when coin value is valid", () => {
                it("should return result with not failure", () => {
                    // Arrange
                    const expectedValue = { failure: false, notice: { errorCode: helpers.noticeHelper.invalidBet } };
                    payload.coinValue = 10;
                    payload.freeSpin = true;

                    // Act
                    const actualValue = consumer.composeBetAmountValidationCriteria(player, payload);

                    // Assert
                    expect(actualValue[2]).toStrictEqual(expectedValue);
                });
            });
        });

        describe("when not free spin", () => {
            beforeEach(() => {
                payload.freeSpin = false;
            });
            describe("when bet level is invalid", () => {
                it("should return result with failure", () => {
                    // Arrange
                    const expectedValue = { failure: true, notice: { errorCode: helpers.noticeHelper.invalidBet } };
                    gameData.gameConfigs.cascadingSlotsConfig.betLevels = [];
                    player.session.currencyGroupId = "3";
                    payload.betLevel = 2;

                    // Act
                    const actualValue = consumer.composeBetAmountValidationCriteria(player, payload);

                    // Assert
                    expect(actualValue[0]).toStrictEqual(expectedValue);
                });
            });

            describe("when bet level is valid", () => {
                it("should return result with not failure", () => {
                    // Arrange
                    const expectedValue = { failure: false, notice: { errorCode: helpers.noticeHelper.invalidBet } };
                    gameData.gameConfigs.cascadingSlotsConfig.betLevels = [1, 5, 10];
                    player.session.currencyGroupId = "1";
                    payload.betLevel = 5;

                    // Act
                    const actualValue = consumer.composeBetAmountValidationCriteria(player, payload);

                    // Assert
                    expect(actualValue[0]).toStrictEqual(expectedValue);
                });
            });

            describe("when coin value is invalid", () => {
                it("should return result with failure", () => {
                    // Arrange
                    const expectedValue = { failure: true, notice: { errorCode: helpers.noticeHelper.invalidBet } };
                    gameData.gameConfigs.cascadingSlotsConfig.betLevels = [1, 5, 10];
                    payload.coinValue = 2;

                    // Act
                    const actualValue = consumer.composeBetAmountValidationCriteria(player, payload);

                    // Assert
                    expect(actualValue[2]).toStrictEqual(expectedValue);
                });
            });

            describe("when coin value is valid", () => {
                it("should return result with not failure", () => {
                    // Arrange
                    const expectedValue = { failure: false, notice: { errorCode: helpers.noticeHelper.invalidBet } };
                    gameData.gameConfigs.cascadingSlotsConfig.betLevels = [1, 5, 10];
                    payload.coinValue = 10;

                    // Act
                    const actualValue = consumer.composeBetAmountValidationCriteria(player, payload);

                    // Assert
                    expect(actualValue[2]).toStrictEqual(expectedValue);
                });
            });
        });

        describe("buy free spin validation", () => {
            it("should return failure when buyFreeSpin is true and freeSpin is true", () => {
                // Arrange
                const expectedValue = { failure: true, notice: { errorCode: helpers.noticeHelper.invalidBet } };
                payload.buyFreeSpin = true;
                payload.freeSpin = true;

                // Act
                const actualValue = consumer.composeBetAmountValidationCriteria(player, payload);

                // Assert
                expect(actualValue[1]).toStrictEqual(expectedValue);
            });

            it("should return not failure when buyFreeSpin is false and freeSpin is true", () => {
                // Arrange
                const expectedValue = { failure: false, notice: { errorCode: helpers.noticeHelper.invalidBet } };
                payload.buyFreeSpin = false;
                payload.freeSpin = true;

                // Act
                const actualValue = consumer.composeBetAmountValidationCriteria(player, payload);

                // Assert
                expect(actualValue[1]).toStrictEqual(expectedValue);
            });

            it("should return not failure when buyFreeSpin is true and freeSpin is false", () => {
                // Arrange
                const expectedValue = { failure: false, notice: { errorCode: helpers.noticeHelper.invalidBet } };
                payload.buyFreeSpin = true;
                payload.freeSpin = false;
                gameData.gameConfigs.cascadingSlotsConfig.betLevels = [1, 5, 10];
                payload.betLevel = 5;

                // Act
                const actualValue = consumer.composeBetAmountValidationCriteria(player, payload);

                // Assert
                expect(actualValue[1]).toStrictEqual(expectedValue);
            });
        });
    });

    describe("adjustBetTracks", () => {
        it("should not change betTracks", () => {
            // Arrange
            const betTrack = {};
            gameData.ingame[player.profile.name] = { betTracks: betTrack };

            // Act
            consumer.adjustBetTracks();

            // Assert
            expect(gameData.ingame[player.profile.name].betTracks).toStrictEqual(betTrack);
        });
    });
});
