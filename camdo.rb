








# external
# nonReentrant
# onlyActiveReserve(_reserve)
# onlyUnfreezedReserve(_reserve)
# onlyAmountGreaterThanZero(_amount)

Item = Struct.new(:address, :tokenId)
InterestRate = Struct.new(:lenderRate, :serviceRate)

def pawn(Item, _dest, _amount, _paymentToken, _borrowCycleNo)
  # required approve
  # Send Item to this contract
  # amount > = 0
  # not in blacklist
end
