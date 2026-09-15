import { BadRequestException, Injectable } from "@nestjs/common";
import {
  activeBankServices,
  loadBankServiceCatalogue,
  type BankServiceRecord,
} from "../../../../libs/parameter-engine/src";

export type { BankServiceRecord } from "../../../../libs/parameter-engine/src";

const BANK_SERVICES = activeBankServices(loadBankServiceCatalogue());

@Injectable()
export class BankServiceDirectory {
  search(query = ""): readonly BankServiceRecord[] {
    const term = query.trim().toUpperCase();
    if (!term) return BANK_SERVICES;
    return BANK_SERVICES.filter((record) =>
      [record.bankServiceId, record.bic, record.name, record.country, record.city]
        .some((value) => value.toUpperCase().includes(term)),
    );
  }

  resolve(bankServiceId: string | undefined): BankServiceRecord {
    if (!bankServiceId?.trim())
      throw new BadRequestException("BANK_SERVICE_ID_REQUIRED");
    const record = BANK_SERVICES.find(
      (candidate) => candidate.bankServiceId === bankServiceId.trim(),
    );
    if (!record) throw new BadRequestException("BANK_SERVICE_NOT_FOUND");
    return record;
  }
}
