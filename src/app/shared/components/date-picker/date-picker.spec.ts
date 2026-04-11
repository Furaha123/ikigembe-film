import type { ComponentFixture } from "@angular/core/testing";
import { TestBed } from "@angular/core/testing";

import { DatePickerComponent } from "./date-picker";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { Subscription } from "rxjs";

describe("DatePickerComponent", () => {
  let component: DatePickerComponent;
  let fixture: ComponentFixture<DatePickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatePickerComponent],
      providers: [
        provideAnimationsAsync(),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DatePickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should call updateDropdown", () => {
    const spy = jest.spyOn(component, "updateDropdown");
    component.updateDropdown(true);
    expect(spy).toHaveBeenCalled();
  });

  it("should update selectedDate", () => {
    const testDate = new Date();
    component["updateSelectedDate"](testDate);
    expect(component["selectedDate"]()).toBe(testDate);
  });

  describe("setDefaultSelectedDate", () => {
    it("should set selectedMonthYear and selectedDate when defaultDate is provided", () => {
      const defaultDate = "2025-03-15";
      fixture.componentRef.setInput("defaultDate", defaultDate);

      component["setDefaultSelectedDate"]();

      expect(component["selectedMonthYear"]()).toBe(defaultDate);
      expect(component["selectedDate"]()).toEqual(new Date(defaultDate));
    });

    it("should not set selectedMonthYear and selectedDate when defaultDate is empty", () => {
      fixture.componentRef.setInput("defaultDate", "");
      const initialMonthYear = component["selectedMonthYear"]();
      const initialDate = component["selectedDate"]();

      component["setDefaultSelectedDate"]();

      expect(component["selectedMonthYear"]()).toBe(initialMonthYear);
      expect(component["selectedDate"]()).toEqual(initialDate);
    });
  });

  describe("updateSelectedDate", () => {
    it("should emit the selected date for calendar type", () => {
      const date = new Date();
      fixture.componentRef.setInput("type", "calendar");
      jest.spyOn(component.dateChange, "emit");

      component["updateSelectedDate"](date);

      expect(component["selectedDate"]()).toEqual(date);
      expect(component.dateChange.emit).toHaveBeenCalledWith(date);
    });

    it("should emit the year-month string for month-year type", () => {
      const date = new Date("2025-03-15");
      fixture.componentRef.setInput("type", "month-year");
      jest.spyOn(component.dateChange, "emit");

      component["updateSelectedDate"](date);

      expect(component["selectedDate"]()).toEqual(date);
      expect(component.dateChange.emit).toHaveBeenCalledWith("2025-03");
    });

    it("should emit the date range for range type", () => {
      const date = new Date("2025-03-15");
      fixture.componentRef.setInput("type", "range");
      jest.spyOn(component.dateChange, "emit");

      component["updateSelectedDate"](date);

      expect(component["selectedDate"]()).toEqual(date);
      expect(component.dateChange.emit).toHaveBeenCalledWith({
        start: new Date("2025-03-15T00:00:00.000Z"),
        end: expect.any(Date)
      });
    });

    it("should emit the month number for month type", () => {
      const date = new Date("2025-03-15");
      fixture.componentRef.setInput("type", "month");
      jest.spyOn(component.dateChange, "emit");

      component["updateSelectedDate"](date);

      expect(component["selectedDate"]()).toEqual(date);
      expect(component.dateChange.emit).toHaveBeenCalledWith(3);
    });

    it("should emit the year number for year type", () => {
      const date = new Date("2025-03-15");
      fixture.componentRef.setInput("type", "year");
      jest.spyOn(component.dateChange, "emit");

      component["updateSelectedDate"](date);

      expect(component["selectedDate"]()).toEqual(date);
      expect(component.dateChange.emit).toHaveBeenCalledWith(2025);
    });
  });

  describe("resetDateRange", () => {
    it("should reset dateRangeValue and emit outputDateRange", () => {
      jest.spyOn(component.outputDateRange, "emit");

      component.resetDateRange();

      expect(component["dateRangeValue"]()).toEqual({
        startDate: null,
        endDate: null
      });
      expect(component.outputDateRange.emit).toHaveBeenCalledWith({
        startDate: null,
        endDate: null
      });
    });
  });

  describe("resetAutoRange", () => {
    it("should reset autoRangeValue and emit outputAutoRange", () => {
      jest.spyOn(component.outputAutoRange, "emit");

      component.resetAutoRange();

      expect(component["autoRangeValue"]()).toBeNull();
      expect(component.outputAutoRange.emit).toHaveBeenCalledWith(null);
    });
  });

  describe("selectDateRange", () => {
    it("should set dateRangeValue and emit dateChange and outputDateRange", () => {
      const dateRange = {
        startDate: new Date("2025-03-15"),
        endDate: new Date("2025-03-20")
      };
      const expectedEmitValue = {
        start: dateRange.startDate,
        end: dateRange.endDate
      };

      jest.spyOn(component.dateChange, "emit");
      jest.spyOn(component.outputDateRange, "emit");

      component["selectDateRange"](dateRange);

      expect(component["dateRangeValue"]()).toEqual(dateRange);
      expect(component.dateChange.emit).toHaveBeenCalledWith(expectedEmitValue);
      expect(component.outputDateRange.emit).toHaveBeenCalledWith(dateRange);
    });

    it("should not set dateRangeValue if startDate or endDate is missing", () => {
      const dateRange = { startDate: null, endDate: new Date("2025-03-20") };
      jest.spyOn(component.dateChange, "emit");
      jest.spyOn(component.outputDateRange, "emit");

      component["selectDateRange"](dateRange);

      expect(component["dateRangeValue"]()).toEqual({
        startDate: null,
        endDate: null
      });
      expect(component.dateChange.emit).not.toHaveBeenCalled();
      expect(component.outputDateRange.emit).toHaveBeenCalledWith(dateRange);
    });
  });

  describe("selectAutoRange", () => {
    it("should set autoRangeValue and emit outputAutoRange", () => {
      const autoRange = "last-30-days";
      jest.spyOn(component.outputAutoRange, "emit");

      component["selectAutoRange"](autoRange);

      expect(component["autoRangeValue"]()).toBe(autoRange);
      expect(component.outputAutoRange.emit).toHaveBeenCalledWith(autoRange);
    });
  });

  describe("onMonthYearChange", () => {
    it("should update selectedDate with the new month and year", () => {
      const monthYear = "2025-03";
      const componentWithPrivateAccess = component as unknown as {
        updateSelectedDate: (type: string) => void;
      };
      jest.spyOn(componentWithPrivateAccess, "updateSelectedDate");

      component.onMonthYearChange(monthYear);

      expect(component["updateSelectedDate"]).toHaveBeenCalledWith(
        new Date(2025, 2, 1)
      );
    });
  });

  describe("onYearRangeChange", () => {
    it("should emit dateChange with the start and end dates", () => {
      const range = {
        startYearMonth: "2025-01",
        endYearMonth: "2025-12"
      };
      jest.spyOn(component.dateChange, "emit");

      component.onYearRangeChange(range);

      expect(component.dateChange.emit).toHaveBeenCalledWith({
        start: new Date("2025-01-01"),
        end: new Date("2025-12-01")
      });
    });
  });

  describe("updateSelectedMonth", () => {
    it("should update selectedMonth and emit dateChange", () => {
      const month = 2;
      jest.spyOn(component.dateChange, "emit");
      component["updateSelectedMonth"](month);

      expect(component["selectedMonth"]()).toEqual(
        new Date(new Date().getFullYear(), 2, 1)
      );
      expect(component.dateChange.emit).toHaveBeenCalledWith(3);
    });
  });

  describe("updateSelectedYear", () => {
    it("should update selectedYear and emit dateChange", () => {
      const year = 2025;
      jest.spyOn(component.dateChange, "emit");

      component["updateSelectedYear"](year);

      expect(component["selectedYear"]()).toBe(year);
      expect(component.dateChange.emit).toHaveBeenCalledWith(year);
    });
  });

  describe("ngOnDestroy", () => {
    it("should unsubscribe from routerSubscription if it exists", () => {
      component["routerSubscription"] = new Subscription();
      const unsubscribeSpy = jest.spyOn(
        component["routerSubscription"],
        "unsubscribe"
      );

      component.ngOnDestroy();

      expect(unsubscribeSpy).toHaveBeenCalled();
    });
  });
});
