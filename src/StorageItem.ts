// -*- indent-tabs-mode: nil; tab-width: 2; -*-
// vim: set ts=2 sw=2 et ai :

/*
  Container Tab Groups
  Copyright (C) 2023 Menhera.org

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import browser from 'webextension-polyfill';
import { EventSink } from 'weeg-events';

export type StorageArea = 'local' | 'sync' | 'managed';

export class StorageItem<T> {
  public static readonly AREA_LOCAL = 'local';
  public static readonly AREA_SYNC = 'sync';
  public static readonly AREA_MANAGED = 'managed';

  private readonly area: browser.Storage.StorageArea | undefined;
  public readonly key: string;
  public readonly areaName: 'managed' | 'local' | 'sync';
  public readonly defaultValue: T;

  public readonly onChanged = new EventSink<T>();

  private readonly observers: Set<(newValue: T) => void> = new Set();

  public constructor(key: string, defaultValue: T, area: StorageArea) {
    this.key = key;
    this.defaultValue = defaultValue;
    this.areaName = area;
    if (!browser.storage) {
      console.warn('browser.storage is not available, storage will not work');
      return;
    }
    switch (area) {
      case StorageItem.AREA_LOCAL: {
        this.area = browser.storage.local;
        this.areaName = 'local';
        break;
      }

      case StorageItem.AREA_SYNC: {
        this.area = browser.storage.sync;
        this.areaName = 'sync';
        break;
      }

      case StorageItem.AREA_MANAGED: {
        this.area = browser.storage.managed;
        this.areaName = 'managed';
        break;
      }

      default: {
        throw new Error(`Unknown storage area: ${area}`);
      }
    }

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (!(this.key in changes)) return;
      if (areaName != this.areaName) return;
      const change = changes[this.key];
      if (!change) return;
      const { newValue } = change;
      const value = undefined !== newValue ? newValue : this.defaultValue;
      this.onChanged.dispatch(value);
      try {
        this.observers.forEach((observer) => observer(value));
      } catch (e) {
        console.error(e);
      }
    });
  }

  private async getRawValue(): Promise<T | undefined> {
    try {
      if (!this.area) return undefined;
      const data = await this.area.get(this.key);
      const value = data[this.key];
      return value as T;
    } catch (_e) {
      // throws in case of uninitialized managed storage
      // we want to return undefined in that case
      return undefined;
    }
  }

  public async hasValue(): Promise<boolean> {
    const value = await this.getRawValue();
    return value !== undefined;
  }

  public async getValue(): Promise<T> {
    const value = await this.getRawValue();
    if (value === undefined) {
      return this.defaultValue;
    }
    return value;
  }

  public async clearValue(): Promise<void> {
    if (this.areaName == 'managed') {
      throw new Error('Cannot clear managed storage');
    }
    if (!this.area) return;
    await this.area.remove(this.key);
  }

  public async setValue(value: T): Promise<void> {
    if (this.areaName == 'managed') {
      throw new Error('Cannot set managed storage');
    }
    if (!this.area) return;
    await this.area.set({ [this.key]: value });
  }

  public observe(callback: (newValue: T) => void, reportCurrentValue = true): void {
    if (reportCurrentValue) {
      this.getValue().then(callback);
    }
    this.observers.add(callback);
  }

  public unobserve(callback: (newValue: T) => void): void {
    this.observers.delete(callback);
  }
}
