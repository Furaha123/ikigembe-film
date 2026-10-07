import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ActorProfileFormComponent } from './actor-profile-form.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { AuthService } from '../../../core/services/auth.service';
import { ActorProfile } from '../../../shared/models/marketplace.interface';
import { RWANDA_PROVINCES, districtsFor } from '../../../shared/models/rwanda-locations';
import { provideMarketplaceUser, marketplaceUser } from '../../../shared/testing/marketplace-session';

const baseProfile = (): ActorProfile => ({
  stage_name: 'Amani', bio: '', gender: 'female', location: 'Musanze, Northern Province',
  province: 'Northern Province', district: 'Musanze',
  languages: ['Kinyarwanda'], skills: ['Acting'],
  contact_email: 'amani@example.com', contact_phone: '+250788000001',
  is_listed: true, date_of_birth: '2000-01-15',
  created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
});

describe('ActorProfileFormComponent — province/district cascade', () => {
  let fixture: ComponentFixture<ActorProfileFormComponent>;
  let component: ActorProfileFormComponent;
  let marketplaceSpy: jasmine.SpyObj<ActorMarketplaceService>;

  beforeEach(async () => {
    marketplaceSpy = jasmine.createSpyObj('ActorMarketplaceService', ['saveProfile']);
    marketplaceSpy.saveProfile.and.returnValue(of(baseProfile()));

    await TestBed.configureTestingModule({
      imports: [ActorProfileFormComponent],
      providers: [
        provideHttpClient(),
        provideTranslateService(),
        provideMarketplaceUser(marketplaceUser('Viewer')),
        { provide: ActorMarketplaceService, useValue: marketplaceSpy },
        { provide: AuthService, useValue: { userName: () => 'Test', userEmail: () => 'test@ex.com' } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ActorProfileFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('exposes all 5 Rwanda provinces', () => {
    expect(component.provinces.length).toBe(5);
    const names = component.provinces.map(p => p.name);
    expect(names).toContain('Kigali City');
    expect(names).toContain('Northern Province');
    expect(names).toContain('Southern Province');
    expect(names).toContain('Eastern Province');
    expect(names).toContain('Western Province');
  });

  it('returns empty districts when no province is selected', () => {
    component.form.controls.province.setValue('');
    expect(component.districts()).toEqual([]);
  });

  it('returns correct districts for Northern Province', () => {
    component.form.controls.province.setValue('Northern Province');
    const districts = component.districts();
    expect(districts).toContain('Musanze');
    expect(districts).toContain('Burera');
    expect(districts.length).toBe(5);
  });

  it('returns correct districts for Kigali City', () => {
    component.form.controls.province.setValue('Kigali City');
    const districts = component.districts();
    expect(districts).toEqual(['Gasabo', 'Kicukiro', 'Nyarugenge']);
  });

  it('clears district when province changes', () => {
    component.form.controls.province.setValue('Northern Province');
    component.form.controls.district.setValue('Musanze');
    component.onProvinceChange();
    expect(component.form.controls.district.value).toBe('');
  });

  it('prefills province and district from loaded profile', () => {
    component.profile = baseProfile();
    component.ngOnChanges();
    expect(component.form.controls.province.value).toBe('Northern Province');
    expect(component.form.controls.district.value).toBe('Musanze');
  });

  it('composes location as "District, Province" when saving', () => {
    component.form.patchValue({
      stage_name: 'Amani', date_of_birth: '2000-01-15',
      province: 'Eastern Province', district: 'Kayonza',
    });
    component.save();
    const payload = marketplaceSpy.saveProfile.calls.mostRecent().args[0];
    expect(payload['location']).toBe('Kayonza, Eastern Province');
    expect(payload['province']).toBe('Eastern Province');
    expect(payload['district']).toBe('Kayonza');
  });

  it('omits province/district from location when both are blank', () => {
    component.form.patchValue({
      stage_name: 'Amani', date_of_birth: '2000-01-15',
      province: '', district: '',
    });
    component.save();
    const payload = marketplaceSpy.saveProfile.calls.mostRecent().args[0];
    expect(payload['location']).toBe('');
    expect(payload['province']).toBeUndefined();
    expect(payload['district']).toBeUndefined();
  });
});

describe('districtsFor utility', () => {
  it('returns empty array for unknown province', () => {
    expect(districtsFor('Unknown')).toEqual([]);
  });

  it('returns districts for Western Province', () => {
    const d = districtsFor('Western Province');
    expect(d).toContain('Rubavu');
    expect(d).toContain('Rusizi');
    expect(d.length).toBe(7);
  });

  it('all provinces have at least 3 districts', () => {
    for (const p of RWANDA_PROVINCES) {
      expect(p.districts.length).toBeGreaterThanOrEqual(3);
    }
  });
});
