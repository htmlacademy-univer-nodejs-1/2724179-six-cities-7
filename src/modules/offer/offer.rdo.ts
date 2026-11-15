import {Expose, Type, plainToInstance} from 'class-transformer';

import {UserRdo} from '../user/user.rdo.js';

export class OfferSummaryRdo {
  @Expose() public id!: string;
  @Expose() public price!: number;
  @Expose() public title!: string;
  @Expose() public type!: string;
  @Expose() public isFavorite!: boolean;
  @Expose() public postDate!: Date;
  @Expose() public city!: object;
  @Expose() public previewImage!: string;
  @Expose() public isPremium!: boolean;
  @Expose() public rating!: number;
  @Expose() public commentsCount!: number;
}

export class OfferRdo extends OfferSummaryRdo {
  @Expose() public description!: string;
  @Expose() public images!: string[];
  @Expose() public rooms!: number;
  @Expose() public guests!: number;
  @Expose() public facilities!: string[];
  @Expose() @Type(() => UserRdo) public author!: UserRdo;
  @Expose() public location!: object;
}

export function toSummary(data: object): OfferSummaryRdo {
  return plainToInstance(OfferSummaryRdo, data, {excludeExtraneousValues: true});
}
export function toOffer(data: object): OfferRdo {
  return plainToInstance(OfferRdo, data, {excludeExtraneousValues: true});
}
