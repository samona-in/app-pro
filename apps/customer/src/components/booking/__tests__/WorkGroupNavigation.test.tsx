import { fireEvent, render } from '@testing-library/react-native';
import type { ServiceWorkGroupWithWorks } from '@samona/types';
import { WorkGroupNavigation } from '../WorkGroupNavigation';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const groups: ServiceWorkGroupWithWorks[] = [
  {
    id: 'fans',
    serviceId: 'electrician',
    name: 'Fans',
    slug: 'fans',
    imageUrl: 'asset://service-work-groups/fan',
    sortOrder: 1,
    isActive: true,
    works: [
      {
        id: 'fan-repair',
        serviceId: 'electrician',
        slug: 'fan-repair',
        name: 'Fan repair',
        icon: null,
        groupId: 'fans',
      },
      {
        id: 'fan-installation',
        serviceId: 'electrician',
        slug: 'fan-installation',
        name: 'Fan installation',
        icon: null,
        groupId: 'fans',
      },
    ],
  },
  {
    id: 'lights',
    serviceId: 'electrician',
    name: 'Lights',
    slug: 'lights',
    imageUrl: 'asset://service-work-groups/light',
    sortOrder: 2,
    isActive: true,
    works: [
      {
        id: 'light-installation',
        serviceId: 'electrician',
        slug: 'light-installation',
        name: 'Light installation',
        icon: null,
        groupId: 'lights',
      },
    ],
  },
];

describe('WorkGroupNavigation', () => {
  it('shows the group image label, name, work count, and active state', () => {
    const { getByLabelText, getByText } = render(
      <WorkGroupNavigation groups={groups} activeGroupId="fans" onSelectGroup={jest.fn()} />,
    );

    expect(getByLabelText('Fans illustration')).toBeTruthy();
    expect(getByText('Fans')).toBeTruthy();
    expect(getByText('2 works')).toBeTruthy();
    expect(getByLabelText('Fans, 2 works').props.accessibilityState).toEqual({ selected: true });
  });

  it('notifies the selected group when a category is tapped', () => {
    const onSelectGroup = jest.fn();
    const { getByLabelText } = render(
      <WorkGroupNavigation groups={groups} activeGroupId="fans" onSelectGroup={onSelectGroup} />,
    );

    fireEvent.press(getByLabelText('Lights, 1 work'));

    expect(onSelectGroup).toHaveBeenCalledWith('lights');
  });
});
