import type { Enums } from '@/types/database';

export type UnitSystem = Enums<'unit_system'>;

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
const ML_PER_FL_OZ = 29.5735295625;
const M_PER_MI = 1609.344;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inches: number) => inches * CM_PER_IN;
export const mlToOz = (ml: number) => ml / ML_PER_FL_OZ;
export const ozToMl = (oz: number) => oz * ML_PER_FL_OZ;
export const metersToMiles = (m: number) => m / M_PER_MI;
export const milesToMeters = (mi: number) => mi * M_PER_MI;

export const round = (value: number, decimals = 1) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

/** Labels for the user's preferred unit system. */
export const unitLabels = (units: UnitSystem) =>
  units === 'imperial'
    ? { weight: 'lb', length: 'in', volume: 'oz', distance: 'mi' }
    : { weight: 'kg', length: 'cm', volume: 'ml', distance: 'km' };

/** Canonical kg → display number in the user's units. */
export const weightToDisplay = (kg: number, units: UnitSystem) =>
  round(units === 'imperial' ? kgToLb(kg) : kg, 1);
/** Display number in the user's units → canonical kg. */
export const weightFromDisplay = (value: number, units: UnitSystem) =>
  round(units === 'imperial' ? lbToKg(value) : value, 3);

export const lengthToDisplay = (cm: number, units: UnitSystem) =>
  round(units === 'imperial' ? cmToIn(cm) : cm, 1);
export const lengthFromDisplay = (value: number, units: UnitSystem) =>
  round(units === 'imperial' ? inToCm(value) : value, 1);

export const volumeToDisplay = (ml: number, units: UnitSystem) =>
  units === 'imperial' ? round(mlToOz(ml), 0) : Math.round(ml);
export const volumeFromDisplay = (value: number, units: UnitSystem) =>
  Math.round(units === 'imperial' ? ozToMl(value) : value);

export const distanceToDisplay = (m: number, units: UnitSystem) =>
  round(units === 'imperial' ? metersToMiles(m) : m / 1000, 2);
export const distanceFromDisplay = (value: number, units: UnitSystem) =>
  Math.round(units === 'imperial' ? milesToMeters(value) : value * 1000);

export const formatWeight = (kg: number, units: UnitSystem) =>
  `${weightToDisplay(kg, units)} ${unitLabels(units).weight}`;
export const formatVolume = (ml: number, units: UnitSystem) =>
  `${volumeToDisplay(ml, units)} ${unitLabels(units).volume}`;

/** Height in imperial is shown as feet + inches. */
export function formatHeight(cm: number, units: UnitSystem) {
  if (units === 'metric') return `${round(cm, 0)} cm`;
  const totalIn = Math.round(cmToIn(cm));
  return `${Math.floor(totalIn / 12)}′ ${totalIn % 12}″`;
}
