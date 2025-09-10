export function isBuyFreeSpinEnabled(buyFreeSpinConfig, session) {
    return (
        buyFreeSpinConfig?.enabled &&
        !buyFreeSpinConfig?.siteExclusions?.some(
            (exclusion) => exclusion.operatorId === session.operatorId && exclusion.sites?.includes(session.siteName)
        )
    );
}
