import {Expose, plainToInstance} from 'class-transformer';

export class UserRdo {
  @Expose() public id!: string;
  @Expose() public name!: string;
  @Expose() public email!: string;
  @Expose() public avatarPath!: string;
  @Expose() public type!: string;
}

export function toUser(data: object): UserRdo {
  return plainToInstance(UserRdo, data, {excludeExtraneousValues: true});
}
