import { BadRequestException } from "@nestjs/common";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const assertIsoValueDate = (value: string): void => {
  const match = ISO_DATE.exec(value);
  if (!match) throw new BadRequestException("INVALID_VALUE_DATE");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new BadRequestException("INVALID_VALUE_DATE");
};
