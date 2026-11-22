import 'reflect-metadata';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {Types} from 'mongoose';
import {AuthService} from '../dist/shared/auth/auth.service.js';
import {hashPassword} from '../dist/shared/auth/password.js';
import {createExceptionFilter} from '../dist/shared/errors/exception-filter.js';
import {FavoriteController} from '../dist/modules/favorite/favorite.controller.js';
import {OfferController} from '../dist/modules/offer/offer.controller.js';
import {CommentController} from '../dist/modules/comment/comment.controller.js';
import {UserController} from '../dist/modules/user/user.controller.js';

function userDocument(data) {
  const user = {id: new Types.ObjectId().toString(), avatarPath: '/img/avatar.svg', favorites: [], sessions: [], ...data};
  user.save = async () => user;
  user.toObject = () => ({...user});
  return user;
}

test('validation, comments, anonymous access and user sessions', async () => {
  const users = [];
  const userService = {
    async create(data) { const user = userDocument({...data, password: await hashPassword(data.password)}); users.push(user); return user; },
    async findByEmail(email) { return users.find((user) => user.email === email) ?? null; },
    async findById(id) { return users.find((user) => user.id === id) ?? null; }
  };
  const offers = [];
  const offerService = {
    async create(data) {
      const author = await userService.findById(data.authorId);
      const offer = {id: new Types.ObjectId().toString(), ...data, author: {...author, _id: author.id}};
      offer.toObject = () => ({...offer}); offers.push(offer); return offer;
    },
    async find() { return offers; },
    async findById(id) { return offers.find((offer) => offer.id === id) ?? null; },
    async findPremiumByCity(city) { return offers.filter((offer) => offer.city.name === city && offer.isPremium); },
    async findFavorites(ids) { return offers.filter((offer) => ids.includes(offer.id)); },
    async updateById(id, data) { const offer = await this.findById(id); if (offer) { Object.assign(offer, data); } return offer; },
    async deleteById(id) { const index = offers.findIndex((offer) => offer.id === id); return index < 0 ? null : offers.splice(index, 1)[0]; }
  };
  const auth = new AuthService(userService, {get: () => 'test-secret'});
  const anonymous = userDocument({name: 'Аноним', email: 'anonymous@local.invalid', type: 'regular'});
  users.push(anonymous);
  const optional = auth.optional.bind(auth);
  auth.current = async (req) => await optional(req) ?? {user: anonymous, sessionId: ''};
  const comments = [];
  const commentService = {
    async create(data) {
      const author = await userService.findById(data.userId);
      const item = {id: new Types.ObjectId().toString(), text: data.text, rating: data.rating, postDate: new Date(), author};
      item.populate = async () => item;
      item.toObject = () => ({...item});
      comments.push({...item, offerId: data.offerId});
      return item;
    },
    async findByOfferId(id) { return comments.filter((comment) => comment.offerId === id); }
  };
  const app = express();
  app.use(express.json());
  app.use('/api', new OfferController(offerService, auth).router, new UserController(userService, auth).router, new FavoriteController(offerService, auth).router, new CommentController(commentService, offerService, auth).router);
  app.use(createExceptionFilter({info() {}, error() {}}));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, options = {}) => fetch(base + path, options);
  const json = (method, body, token) => ({method, headers: {'content-type': 'application/json', ...(token ? {authorization: `Bearer ${token}`} : {})}, body: JSON.stringify(body)});
  try {
    for (const email of ['one@example.com', 'two@example.com']) {
      const form = new FormData();
      for (const [key, value] of Object.entries({name: 'Test', email, password: 'secret12', type: 'regular'})) { form.set(key, value); }
      const response = await request('/users/register', {method: 'POST', body: form});
      assert.equal(response.status, 201); assert.equal((await response.json()).password, undefined);
    }
    assert.notEqual(users[0].password, 'secret12');
    let response = await request('/users/login', json('POST', {email: 'one@example.com', password: 'wrong123'})); assert.equal(response.status, 401);
    response = await request('/users/login', json('POST', {email: 'one@example.com', password: 'secret12'})); const token1 = (await response.json()).token;
    response = await request('/users/login', json('POST', {email: 'two@example.com', password: 'secret12'})); const token2 = (await response.json()).token;
    const body = {title:'An apartment', description:'A lovely apartment in Paris', postDate:'2026-01-01T00:00:00.000Z', city:{name:'Paris', location:{latitude:48.85661, longitude:2.351499}}, previewImage:'https://example.com/a', images:Array.from({length: 6}, (_, i) => `https://example.com/${i}`), isPremium:true, rating:4, type:'apartment', rooms:1, guests:2, price:100, facilities:['Breakfast'], location:{latitude:1, longitude:2}};
    response = await request('/offers', json('POST', {...body, rooms: 0}, token1)); assert.equal(response.status, 400);
    response = await request('/offers', json('POST', body)); assert.equal(response.status, 201); const offer = await response.json(); assert.equal(offer.author.id, anonymous.id); assert.equal(offer.author.password, undefined); assert.equal(offer.commentsCount, 0);
    response = await request(`/offers/${offer.id}`, json('PATCH', {title:'Changed title'}, token2)); assert.equal(response.status, 200);
    response = await request(`/offers/${offer.id}`, json('PATCH', {author:users[1].id}, token1)); assert.equal(response.status, 400);
    response = await request('/offers/not-an-id/comments'); assert.equal(response.status, 400);
    response = await request(`/offers/${offer.id}/comments`, json('POST', {text:'bad', rating:5})); assert.equal(response.status, 400);
    response = await request(`/offers/${offer.id}/comments`, json('POST', {text:'Great place', rating:5})); assert.equal(response.status, 201); assert.equal((await response.json()).author.id, anonymous.id);
    response = await request(`/offers/${offer.id}/comments`); assert.equal((await response.json()).length, 1);
    response = await request(`/offers/${new Types.ObjectId()}/comments`); assert.equal(response.status, 404);
    response = await request(`/favorites/${offer.id}`, {method:'PUT', headers:{authorization:`Bearer ${token2}`}}); assert.equal(response.status, 200); assert.equal((await response.json()).isFavorite, true);
    response = await request('/favorites', {headers:{authorization:`Bearer ${token1}`}}); assert.deepEqual(await response.json(), []);
    response = await request(`/offers/${offer.id}`, {headers:{authorization:`Bearer ${token2}`}}); assert.equal((await response.json()).isFavorite, true);
    response = await request(`/offers/${offer.id}`); assert.equal((await response.json()).isFavorite, false);
    response = await request(`/favorites/${offer.id}`, {method:'DELETE', headers:{authorization:`Bearer ${token2}`}}); assert.equal(response.status, 204);
    response = await request('/users/logout', {method:'DELETE', headers:{authorization:`Bearer ${token2}`}}); assert.equal(response.status, 204);
    response = await request('/users/status', {headers:{authorization:`Bearer ${token2}`}}); assert.equal(response.status, 401);
    response = await request(`/offers/${offer.id}`, {method:'DELETE'}); assert.equal(response.status, 204);
    response = await request(`/offers/${offer.id}`); assert.equal(response.status, 404);
    response = await request('/users/login', {method:'POST', headers:{'content-type':'application/json'}, body:'{'}); assert.equal(response.status, 400);
  } finally { server.close(); }
});
