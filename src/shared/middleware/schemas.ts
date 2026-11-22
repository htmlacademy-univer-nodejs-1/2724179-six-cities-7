import Joi from 'joi';
import {Facility, HousingType} from '../../types/offer.type.js';
import {UserType} from '../../types/user.type.js';

const cities: Record<string, [number, number]> = {
  Paris: [48.85661, 2.351499], Cologne: [50.938361, 6.959974], Brussels: [50.846557, 4.351697],
  Amsterdam: [52.370216, 4.895168], Hamburg: [53.550341, 10.000654], Dusseldorf: [51.225402, 6.776314]
};
const location = Joi.object({latitude: Joi.number().min(-90).max(90).required(), longitude: Joi.number().min(-180).max(180).required()});
const city = Joi.object({name: Joi.string().valid(...Object.keys(cities)).required(), location: location.required()}).custom((value, helpers) => {
  const coordinates = cities[value.name];
  return coordinates && value.location.latitude === coordinates[0] && value.location.longitude === coordinates[1] ? value : helpers.error('any.invalid');
});
const offerFields = {
  title: Joi.string().min(10).max(100), description: Joi.string().min(20).max(1024),
  postDate: Joi.string().isoDate(), city, previewImage: Joi.string().uri(),
  images: Joi.array().items(Joi.string().uri()).length(6).unique(), isPremium: Joi.boolean(),
  rating: Joi.number().min(1).max(5).multiple(0.1), type: Joi.string().valid(...Object.values(HousingType)),
  rooms: Joi.number().integer().min(1).max(8), guests: Joi.number().integer().min(1).max(10),
  price: Joi.number().integer().min(100).max(100000),
  facilities: Joi.array().items(Joi.string().valid(...Object.values(Facility))).min(1).unique(), location
};
export const createOfferSchema = Joi.object(offerFields).fork(Object.keys(offerFields), (field) => field.required()).required();
export const updateOfferSchema = Joi.object(offerFields).min(1).required();
export const createCommentSchema = Joi.object({text: Joi.string().min(5).max(1024).required(), rating: Joi.number().integer().min(1).max(5).required()}).required();
const email = Joi.string().email().required();
const password = Joi.string().min(6).max(12).required();
export const createUserSchema = Joi.object({name: Joi.string().min(1).max(15).required(), email, password, type: Joi.string().valid(...Object.values(UserType)).required()}).required();
export const loginUserSchema = Joi.object({email, password}).required();
export const cityParamsSchema = Joi.object({city: Joi.string().valid(...Object.keys(cities)).required()});
