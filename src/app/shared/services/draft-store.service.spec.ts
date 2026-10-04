import { TestBed } from '@angular/core/testing';
import { DraftStoreService, clearAllDrafts } from './draft-store.service';

describe('DraftStoreService', () => {
  let drafts: DraftStoreService;

  beforeEach(() => {
    sessionStorage.clear();
    drafts = TestBed.inject(DraftStoreService);
  });
  afterEach(() => sessionStorage.clear());

  it('saves, loads and clears a draft', () => {
    drafts.save('apply:1', { note: 'Hello', videoIds: [3] });
    expect(drafts.load<{ note: string; videoIds: number[] }>('apply:1')).toEqual({ note: 'Hello', videoIds: [3] });
    drafts.clear('apply:1');
    expect(drafts.load('apply:1')).toBeNull();
  });

  it('ignores unreadable stored values', () => {
    sessionStorage.setItem('ikigembe_draft:bad', '{not json');
    sessionStorage.setItem('ikigembe_draft:num', '42');
    expect(drafts.load('bad')).toBeNull();
    expect(drafts.load('num')).toBeNull();
  });

  it('clearAllDrafts (sign-out) removes every draft and nothing else', () => {
    drafts.save('apply:1', { note: 'a' });
    drafts.save('casting:new', { title: 'b' });
    sessionStorage.setItem('ikigembe_pending_payments', '{}');
    clearAllDrafts();
    expect(drafts.load('apply:1')).toBeNull();
    expect(drafts.load('casting:new')).toBeNull();
    expect(sessionStorage.getItem('ikigembe_pending_payments')).toBe('{}');
  });
});
