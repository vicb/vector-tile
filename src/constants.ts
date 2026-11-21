export const WIRE_TYPE_MASK = 0x7;
export const COMMAND_ID_MASK = 0x7;

export const WireType = {
  Varint: 0,
  Bit64: 1,
  LengthDelimited: 2,
  Bit32: 5,
} as const;

export const TileTag = {
  Layers: (3 << 3) | WireType.LengthDelimited, // 26
} as const;

export const LayerTag = {
  Name: (1 << 3) | WireType.LengthDelimited, // 10
  Features: (2 << 3) | WireType.LengthDelimited, // 18
  Keys: (3 << 3) | WireType.LengthDelimited, // 26
  Values: (4 << 3) | WireType.LengthDelimited, // 34
  Extent: (5 << 3) | WireType.Varint, // 40
  Version: (15 << 3) | WireType.Varint, // 120
} as const;

export const ValueTag = {
  String: (1 << 3) | WireType.LengthDelimited, // 10
  Float: (2 << 3) | WireType.Bit32, // 21
  Double: (3 << 3) | WireType.Bit64, // 25
  Int: (4 << 3) | WireType.Varint, // 32
  UInt: (5 << 3) | WireType.Varint, // 40
  SInt: (6 << 3) | WireType.Varint, // 48
  Bool: (7 << 3) | WireType.Varint, // 56
} as const;

export const FeatureTag = {
  Id: (1 << 3) | WireType.Varint, // 8
  Tags: (2 << 3) | WireType.LengthDelimited, // 18
  Type: (3 << 3) | WireType.Varint, // 24
  Geometry: (4 << 3) | WireType.LengthDelimited, // 34
} as const;

export const enum Command {
  MoveTo = 1,
  LineTo = 2,
  ClosePath = 7,
}
