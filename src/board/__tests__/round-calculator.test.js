import { stub } from "jest-micro-auto-stub";
import CascadingBoardGenerator from "../cascading-board-generator";
import RoundCalculator from "../round-calculator";
import TumbleCalculator from "../tumble-calculator";
import { gameConfigs } from "../../test-data";

const boardGenerator = stub(CascadingBoardGenerator);

const tumbleCalculator = new TumbleCalculator();

function initCalculator() {
    return new RoundCalculator({
        boardGenerator,
        tumbleCalculator,
    });
}

function initRoundDocument({ id = 1, playerId, coinValue, betLevel, betMultiplier, freeSpin }) {
    return {
        id,
        coinValue,
        betLevel,
        betMultiplier,
        paid: false,
        rate: 1,
        exchangeRateId: 1,
        playerId,
        odds: gameConfigs.cascadingSlotsConfig,
        betwin: 0,
        freeSpin,
        multiplier: 0,
        totalMultiplier: 0,
        save: jest.fn(),
    };
}

describe("settle tumble", () => {
    describe("normal spin", () => {
        describe("when having winning icons", () => {
            const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
            round.settlementResult = {
                tumbles: [
                    {
                        originalBoard: "8,8,8,3,8,10,8,8,8,9,5,9,8,2,4,9,5,4,6,2,4,6,3,8,3,1,5,6,7,7",
                        multipliers: [2],
                    },
                ],
            };

            it("should calculate betwin correctly", () => {
                //Arrange

                const calculator = initCalculator();

                //Act
                calculator.settleTumble(round, 0, 100);

                //Assert
                expect(round.betwin).toEqual(round.coinValue * round.betLevel * 1.5 * 2);
            });

            it("should return true", () => {
                //Arrange
                const calculator = initCalculator();

                //Act
                const result = calculator.settleTumble(round, 0, 100);

                //Assert
                expect(result).toBeTrue();
            });
        });
    });

    describe("free spin", () => {
        describe("when having winning icons", () => {
            const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20, freeSpin: true });
            round.settlementResult = {
                tumbles: [
                    {
                        originalBoard: "8,8,8,3,8,10,8,8,8,9,5,9,8,2,4,9,5,4,6,2,4,6,3,8,3,1,5,6,7,7",
                        multipliers: [2],
                    },
                ],
            };

            it("should calculate betwin correctly", () => {
                //Arrange
                const calculator = initCalculator();
                const totalMultiplier = 2;

                //Act
                calculator.settleTumble(round, totalMultiplier, 100);

                //Assert
                expect(round.betwin).toEqual(round.coinValue * round.betLevel * 1.5 * (totalMultiplier + 2));
            });

            it("should return true", () => {
                //Arrange
                const calculator = initCalculator();

                //Act
                const result = calculator.settleTumble(round, 0, 100);

                //Assert
                expect(result).toBeTrue();
            });
        });
    });
});

describe("count free spin", () => {
    describe("when there are enough free spin icons", () => {
        it("should calculate free spin correctly based on odds gameConfigs", () => {
            const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
            round.settlementResult = {
                tumbles: [
                    {
                        originalBoard: "8,9,9,9,9,10,8,8,8,9,5,9,8,2,4,9,9,9,9,2,4,6,3,8,3,1,5,6,7,7",
                        multipliers: [2],
                    },
                ],
            };

            const calculator = initCalculator();

            //Act
            calculator.countFreeSpin(round);

            //Assert
            expect(round.settlementResult.freeSpins.odds).toEqual(3);
        });
    });
});

afterEach(() => {
    jest.resetAllMocks();
});
